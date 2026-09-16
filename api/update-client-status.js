import { createClient } from "@supabase/supabase-js";
import { getSupabaseClubbeurAdmin } from "../lib/db/supabaseClubbeurAdmin.js";
import { pousserA } from "../lib/notifications/envoyer.js";
import { deciderStory } from "../lib/admin/deciderContenu.js";
import { libelleMotifDepart } from "../lib/notifications/push.js";
import { computePoints } from "../lib/points/computePoints.js";
import { DEFAULT_POINT_RULES } from "../dashboardData.js";
import {
  forfaitContenu,
  libelleContenu,
  echeanceAutoValidation,
  jourLocal,
  decalerJour,
  resumePeriodes,
  serieParJour,
  appareilsActifs,
  actifsParJour,
  repartitionMotifs,
  syntheseAvis,
  filsSupport,
  statutClub,
  resumeClubs,
} from "../lib/admin/pilotage.js";

/* LA ROUTE ADMIN. Tout est reserve a ADMIN_EMAIL :

   POST                         changer le statut d'un club (actif / essai / suspendu)
   GET  ?action=pilotage        le tableau de bord de pilotage.html : les DEUX bases
   POST ?action=pilotage-repondre  repondre a un clubbeur depuis le tableau de bord
   POST ?action=pilotage-valider   valider ou refuser une story / un post
   POST ?action=pilotage-effacer   effacer une conversation du support (probleme regle)

   Greffe ici plutot que dans un nouveau fichier : le plan Hobby plafonne a
   12 fonctions serverless et api/ y est deja (voir CLAUDE.md). Ce fichier
   etait deja reserve a l'admin, c'est sa place naturelle.

   ⚠️ L'ADMIN SE PROUVE PAR LE JETON, JAMAIS PAR LE CORPS. Le jeton est relu
   par la base des gerants (getUser) et son e-mail compare a ADMIN_EMAIL.
   Les cles service_role des deux bases contournent RLS : sans ce controle,
   n'importe qui lirait tous les clubs et tous les clubbeurs. */

const ADMIN_EMAIL = "steppejulien1@gmail.com";
const ALLOWED_STATUSES = new Set(["actif", "essai", "suspendu"]);

// Les comptes de Julien et ceux de nos outils ne sont pas des clients : les
// compter gonflerait les inscrits, les stories et le support.
// Adresses de Julien relevees en base le 13/09/2026 (dont une faute de frappe).
const COMPTES_INTERNES = new Set([
  "viralnight001@gmail.com",
  "noctify.support@gmail.com",
  "julien.steppe123@gmail.com",
  "steppejulien1@gmail.com",
  "steppejulien@gmail.com",
  "steppejulirn1@gmail.com",
]);
const DOMAINES_INTERNES = ["@viralnight.test", "@demo.mirage", "@mirage.club", "@example.com"];

function estInterne(email) {
  const e = String(email || "").toLowerCase();
  return COMPTES_INTERNES.has(e) || DOMAINES_INTERNES.some((d) => e.endsWith(d));
}

function json(response, body, status = 200) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return request.body ? JSON.parse(request.body) : {};

  let rawBody = "";
  for await (const chunk of request) {
    rawBody += chunk;
  }
  return rawBody ? JSON.parse(rawBody) : {};
}

async function verifierAdmin(request) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return { status: 500, error: "Supabase admin env vars missing" };

  const token = (request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return { status: 401, error: "Missing admin session" };

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || data?.user?.email?.toLowerCase() !== ADMIN_EMAIL) return { status: 403, error: "Unauthorized admin" };
  return { supabase };
}

export default async function handler(request, response) {
  const action = new URL(request.url, "http://localhost").searchParams.get("action");

  if (action === "pilotage" || action === "pilotage-repondre" || action === "pilotage-valider" || action === "pilotage-effacer") {
    const attendu = action === "pilotage" ? "GET" : "POST";
    if (request.method !== attendu) return json(response, { error: "Method not allowed" }, 405);
    const admin = await verifierAdmin(request);
    if (admin.error) return json(response, { error: admin.error }, admin.status);
    if (action === "pilotage") return actionPilotage(response, admin.supabase);
    if (action === "pilotage-valider") return actionValider(request, response, admin.supabase);
    if (action === "pilotage-effacer") return actionEffacerConversation(request, response);
    return actionRepondre(request, response);
  }

  if (request.method !== "POST") {
    return json(response, { error: "Method not allowed" }, 405);
  }

  const admin = await verifierAdmin(request);
  if (admin.error) return json(response, { error: admin.error }, admin.status);
  const supabase = admin.supabase;

  let payload;
  try {
    payload = await readBody(request);
  } catch {
    return json(response, { error: "Invalid JSON body" }, 400);
  }

  const ownerEmail = String(payload.owner_email || "").trim().toLowerCase();
  const establishmentId = String(payload.establishment_id || "").trim();
  const subscriptionStatus = String(payload.subscription_status || "").trim();

  if (!ALLOWED_STATUSES.has(subscriptionStatus)) {
    return json(response, { error: "Invalid subscription status" }, 400);
  }

  // Le tableau de bord change un statut par l'id du club : un club sans
  // proprietaire (cree par l'admin, pas encore reclame) n'a pas d'e-mail.
  // L'admin a deja ete verifie par le jeton : lire l'id dans le corps est
  // legitime ICI, ce ne l'est pas dans une route de gerant.
  let cible = null;
  if (/^[0-9a-f-]{36}$/i.test(establishmentId)) {
    cible = establishmentId;
  } else {
    if (!ownerEmail) {
      return json(response, { error: "Client email is required" }, 400);
    }
    const ownerResult = await supabase
      .from("establishment_owners")
      .select("email, establishment_id")
      .ilike("email", ownerEmail)
      .maybeSingle();

    if (ownerResult.error) {
      return json(response, { error: ownerResult.error.message }, 500);
    }
    if (!ownerResult.data?.establishment_id) {
      return json(response, { error: "Client not found" }, 404);
    }
    cible = ownerResult.data.establishment_id;
  }

  const updateResult = await supabase
    .from("establishments")
    .update({ subscription_status: subscriptionStatus })
    .eq("id", cible)
    .select("id, name, subscription_status")
    .single();

  if (updateResult.error) {
    return json(response, { error: updateResult.error.message }, 500);
  }

  return json(response, {
    ok: true,
    owner_email: ownerEmail || null,
    establishment_id: updateResult.data.id,
    establishment_name: updateResult.data.name,
    subscription_status: updateResult.data.subscription_status,
  });
}

/* Toutes les lignes d'une requete, par paquets de 1000 (le plafond de
   PostgREST). Sans ca, le tableau de bord s'arreterait net au millieme
   inscrit sans le dire. `fabrique` doit poser un ordre stable. */
async function toutLire(fabrique, max = 50000) {
  const lignes = [];
  for (let debut = 0; debut < max; debut += 1000) {
    const { data, error } = await fabrique().range(debut, debut + 999);
    if (error) throw new Error(error.message);
    lignes.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return lignes;
}

async function tousLesComptesAuth(client) {
  const comptes = [];
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    comptes.push(...(data?.users || []));
    if (!data?.users || data.users.length < 1000) break;
  }
  return comptes;
}

async function actionPilotage(response, b2b) {
  const maintenant = new Date();
  const mois = jourLocal(maintenant).slice(0, 7);
  const trenteJours = decalerJour(jourLocal(maintenant), -29);
  const erreurs = [];

  // Une source en panne ne doit pas vider tout l'ecran : chaque lecture
  // rend sa valeur par defaut et note ce qui manque.
  const lire = async (nom, fn, defaut = []) => {
    try {
      return await fn();
    } catch (e) {
      erreurs.push(`${nom} : ${e.message}`);
      return defaut;
    }
  };

  let cb = null;
  try {
    cb = getSupabaseClubbeurAdmin();
  } catch (e) {
    erreurs.push("Base des clubbeurs non configurée sur le serveur");
  }
  const cote = (nom, fn, defaut = []) => (cb ? lire(nom, fn, defaut) : Promise.resolve(defaut));

  const lecture = async (requete) => {
    const { data, error } = await requete;
    if (error) throw new Error(error.message);
    return data || [];
  };

  const [
    etabs, proprios, recompensesB2B, contenus, scans, instas, demos, contenusSite, emails,
    comptesAuth, users, stories, mentionsInstagram, grants, redemptions, cadeaux, installations, ouvertures, departs, support, abonnements, clubsCb,
  ] = await Promise.all([
    lire("établissements", () => toutLire(() => b2b.from("establishments").select("id, name, city, category, phone, subscription_status, created_at").order("created_at"))),
    lire("propriétaires", () => toutLire(() => b2b.from("establishment_owners").select("email, establishment_id, created_at").order("created_at"))),
    lire("récompenses des clubs", () => toutLire(() => b2b.from("rewards").select("establishment_id, active, created_at").order("created_at"))),
    lire("contenus", () => toutLire(() => b2b.from("submissions").select("establishment_id, submitted_at").order("submitted_at"))),
    lire("scans", () => toutLire(() => b2b.from("qr_scans").select("establishment_id, scanned_at").order("scanned_at"))),
    lire("comptes Instagram", () => toutLire(() => b2b.from("establishment_instagram_accounts").select("establishment_id").order("establishment_id"))),
    lire("demandes de démo", () => toutLire(() => b2b.from("demo_requests").select("club, email, phone, created_at").order("created_at", { ascending: false }))),
    // Les liens envoyes depuis la page QR du site (scan.html) : sans story
    // d'origine dans l'appli, ils n'existent que cote gerants.
    lire("liens envoyés depuis le site", () => lecture(
      b2b.from("submissions").select("id, establishment_id, platform, content_type, url, declared_views, submitted_at")
        .eq("status", "pending").is("external_story_id", null).order("submitted_at", { ascending: false }).limit(200)
    )),
    lire("e-mails", () => lecture(b2b.from("journal_emails").select("*").order("created_at", { ascending: false }).limit(100))),
    cote("comptes", () => tousLesComptesAuth(cb)),
    cote("clubbeurs", () => toutLire(() => cb.from("users").select("id, handle, email, created_at, points_balance, referred_by").order("created_at"))),
    cote("stories", () => toutLire(() => cb.from("story_events").select("id, user_id, club_id, mentioned_at, verified, kind, url, awarded_points, verified_views, views_source, review_status, reviewed_at, review_auto, verifie_instagram").order("mentioned_at"))),
    cote("mentions Instagram", () => lecture(cb.from("instagram_story_mentions").select("mid, club_id, username, statut, signature_ok, recu_le").order("recu_le", { ascending: false }).limit(15))),
    cote("points", () => toutLire(() => cb.from("point_grants").select("user_id, amount, created_at").order("created_at"))),
    cote("récompenses échangées", () => toutLire(() => cb.from("redemptions").select("user_id, redeemed_at").order("redeemed_at"))),
    cote("cadeaux du jour", () => toutLire(() => cb.from("daily_gifts").select("user_id, created_at").order("created_at"))),
    cote("installations", () => toutLire(() => cb.from("app_evenements").select("appareil, plateforme, created_at").eq("type", "installation").order("id"))),
    cote("ouvertures", () => toutLire(() => cb.from("app_evenements").select("appareil, jour").eq("type", "ouverture").gte("jour", trenteJours).order("id"))),
    cote("départs", () => toutLire(() => cb.from("departs").select("*").order("created_at", { ascending: false }))),
    cote("support", () => toutLire(() => cb.from("support_messages").select("user_id, message, auteur, created_at").order("created_at"))),
    cote("notifications", () => toutLire(() => cb.from("push_subscriptions").select("user_id").order("user_id"))),
    cote("établissements de l'appli", () => toutLire(() => cb.from("clubs").select("id, name, establishment_id").order("id"))),
  ]);

  // Qui est interne : par l'e-mail du compte Auth (public.users.email peut
  // etre vide), sinon par celui du profil.
  const emailParId = new Map(comptesAuth.map((c) => [c.id, c.email]));
  const internes = new Set(
    users.filter((u) => estInterne(emailParId.get(u.id) || u.email)).map((u) => u.id)
      .concat(comptesAuth.filter((c) => estInterne(c.email)).map((c) => c.id))
  );
  const externe = (ligne) => !internes.has(ligne.user_id);
  const clients = users.filter((u) => !internes.has(u.id));
  const storiesClients = stories.filter(externe);
  const somme = (lignes) => lignes.reduce((t, l) => t + (Number(l.amount) || 0), 0);
  const grantsClients = grants.filter(externe);

  const profils = Object.fromEntries(
    users.map((u) => [u.id, { pseudo: u.handle || null, email: emailParId.get(u.id) || u.email || null }])
  );

  // --- Clubs : la base des gerants, completee par l'activite cote appli ---
  const clubCbParEtab = new Map(clubsCb.filter((c) => c.establishment_id).map((c) => [c.establishment_id, c.id]));
  const activiteParClub = new Map();
  for (const s of storiesClients) {
    const a = activiteParClub.get(s.club_id) || { stories: 0, clubbeurs: new Set(), dernier: null };
    a.stories += 1;
    a.clubbeurs.add(s.user_id);
    if (!a.dernier || s.mentioned_at > a.dernier) a.dernier = s.mentioned_at;
    activiteParClub.set(s.club_id, a);
  }
  const plusRecent = (...dates) => dates.filter(Boolean).sort().pop() || null;
  const telephoneParEmail = new Map();
  for (const d of demos) {
    const cle = String(d.email || "").toLowerCase();
    if (cle && d.phone && !telephoneParEmail.has(cle)) telephoneParEmail.set(cle, d.phone);
  }
  const telephoneDemo = (emails) => emails.map((e) => telephoneParEmail.get(String(e).toLowerCase())).find(Boolean) || null;
  const listeClubs = etabs
    .map((e) => {
      const statut = statutClub(e.subscription_status);
      const act = activiteParClub.get(clubCbParEtab.get(e.id));
      const contenusClub = contenus.filter((c) => c.establishment_id === e.id);
      const scansClub = scans.filter((s) => s.establishment_id === e.id);
      return {
        id: e.id,
        nom: e.name,
        ville: e.city,
        type: e.category,
        statut: ALLOWED_STATUSES.has(e.subscription_status) ? e.subscription_status : "essai",
        statutCode: statut.code,
        statutLibelle: statut.libelle,
        depuis: e.created_at,
        proprietaire: proprios.filter((o) => o.establishment_id === e.id).map((o) => o.email).join(", ") || null,
        // Le numero saisi par le gerant a l'installation ; a defaut, celui de
        // sa demande de demo s'il en a fait une avec la meme adresse.
        telephone: e.phone || telephoneDemo(proprios.filter((o) => o.establishment_id === e.id).map((o) => o.email)) || null,
        telephoneDeLaDemo: !e.phone && !!telephoneDemo(proprios.filter((o) => o.establishment_id === e.id).map((o) => o.email)),
        recompenses: recompensesB2B.filter((r) => r.establishment_id === e.id && r.active !== false).length,
        instagram: instas.some((i) => i.establishment_id === e.id),
        stories: act?.stories || 0,
        clubbeurs: act?.clubbeurs.size || 0,
        contenus: contenusClub.length,
        scans: scansClub.length,
        derniereActivite: plusRecent(
          act?.dernier,
          contenusClub.map((c) => c.submitted_at).sort().pop(),
          scansClub.map((s) => s.scanned_at).sort().pop()
        ),
      };
    })
    .sort((x, y) => {
      const ordre = { payant: 0, essai: 1, suspendu: 2 };
      return ordre[x.statutCode] - ordre[y.statutCode] || String(x.nom).localeCompare(String(y.nom), "fr");
    });

  // --- A valider : TOUTES les stories et publications de l'appli, lues a la
  // source (story_events), y compris celles des comptes internes -- c'est une
  // file de travail, pas une statistique : Julien doit voir ses propres tests.
  const nomClubCb = new Map(clubsCb.map((c) => [c.id, c.name]));
  const nomEtab = new Map(etabs.map((e) => [e.id, e.name]));
  // Instagram relie : la base des gerants le sait par l'etablissement.
  const etabParClubCb = new Map(clubsCb.map((c) => [c.id, c.establishment_id]));
  const etabsInstagram = new Set(instas.map((i) => i.establishment_id));
  const contenuAppli = (s) => ({
    id: s.id,
    clubId: s.club_id,
    instagramRelie: etabsInstagram.has(etabParClubCb.get(s.club_id)),
    autoLe: echeanceAutoValidation(s.mentioned_at),
    type: libelleContenu(s.kind),
    kind: s.kind,
    url: s.url || null,
    date: s.mentioned_at,
    club: nomClubCb.get(s.club_id) || null,
    pseudo: profils[s.user_id]?.pseudo || null,
    interne: internes.has(s.user_id),
    points: forfaitContenu(s.kind, s.views_source === "tiktok_api" ? s.verified_views : null),
  });
  const enAttente = stories
    .filter((s) => !s.verified && !s.review_status)
    .sort((x, y) => String(y.mentioned_at).localeCompare(String(x.mentioned_at)))
    .map(contenuAppli);
  const decisions = stories
    .filter((s) => s.review_status || s.verified)
    .sort((x, y) => String(y.reviewed_at || y.mentioned_at).localeCompare(String(x.reviewed_at || x.mentioned_at)))
    .slice(0, 15)
    .map((s) => ({ ...contenuAppli(s), decision: s.review_status === "refusee" ? "refusee" : "validee", auto: !!s.review_auto, instagram: !!s.verifie_instagram, pointsAccordes: s.awarded_points, decideLe: s.reviewed_at }));
  const liensSite = contenusSite.map((c) => ({
    id: c.id,
    type: libelleContenu(c.content_type === "story" ? "story" : c.content_type === "reel" ? "reel" : c.platform === "tiktok" ? "tiktok" : ""),
    url: c.url || null,
    date: c.submitted_at,
    club: nomEtab.get(c.establishment_id) || null,
    vuesAnnoncees: c.declared_views,
  }));

  const supportClients = support.filter(externe);
  const avis = syntheseAvis(supportClients);
  /* Les fils des comptes de Julien s'affichent aussi (il teste le support
     avec eux), marques « Test » ; seuls ceux des clients comptent dans
     « a traiter ». */
  const fils = filsSupport(support.filter((m) => !/@viralnight\.test$/i.test(profils[m.user_id]?.email || "")), profils)
    .map((f) => ({ ...f, interne: internes.has(f.user_id) }));
  const plateformes = { iphone: 0, android: 0, ordinateur: 0, autre: 0 };
  for (const i of installations) plateformes[plateformes[i.plateforme] === undefined ? "autre" : i.plateforme] += 1;

  return json(response, {
    genereLe: maintenant.toISOString(),
    erreurs,
    validation: {
      aValider: enAttente.length + liensSite.length,
      appli: enAttente,
      site: liensSite,
      decisions,
      mentionsInstagram: mentionsInstagram.map((m) => ({ club: nomClubCb.get(m.club_id) || null, pseudo: m.username || null, statut: m.statut, date: m.recu_le })),
    },
    emails: {
      total: emails.length,
      nonEnvoyes: emails.filter((e) => !e.envoye).length,
      derniers: emails.map((e) => ({ id: e.id, type: e.type, sujet: e.sujet, texte: e.texte, envoye: e.envoye, erreur: e.erreur, date: e.created_at })),
    },
    clubbeurs: {
      periodes: resumePeriodes(clients.map((u) => u.created_at), maintenant),
      serie: serieParJour(clients.map((u) => u.created_at), 30, maintenant),
      parraines: clients.filter((u) => u.referred_by).length,
      notifsActives: new Set(abonnements.filter(externe).map((a) => a.user_id)).size,
      pointsEnCirculation: clients.reduce((t, u) => t + (Number(u.points_balance) || 0), 0),
      derniers: clients.slice(-8).reverse().map((u) => ({ pseudo: u.handle || null, date: u.created_at, parraine: !!u.referred_by })),
    },
    appli: {
      installations: {
        periodes: resumePeriodes(installations.map((i) => i.created_at), maintenant),
        serie: serieParJour(installations.map((i) => i.created_at), 30, maintenant),
        plateformes,
      },
      actifs: {
        jour: appareilsActifs(ouvertures, 1, maintenant),
        semaine: appareilsActifs(ouvertures, 7, maintenant),
        mois: appareilsActifs(ouvertures, 30, maintenant),
        serie: actifsParJour(ouvertures, 30, maintenant),
      },
    },
    activite: {
      stories: resumePeriodes(storiesClients.map((s) => s.mentioned_at), maintenant),
      storiesValidees: storiesClients.filter((s) => s.verified).length,
      points: {
        ceMois: somme(grantsClients.filter((g) => jourLocal(g.created_at)?.slice(0, 7) === mois)),
        total: somme(grantsClients),
      },
      recompenses: resumePeriodes(redemptions.filter(externe).map((r) => r.redeemed_at), maintenant),
      cadeaux: resumePeriodes(cadeaux.filter(externe).map((c) => c.created_at), maintenant),
    },
    departs: {
      periodes: resumePeriodes(departs.map((d) => d.created_at), maintenant),
      motifs: repartitionMotifs(departs),
      derniers: departs.slice(0, 20).map((d) => ({
        date: d.created_at,
        motif: libelleMotifDepart(d.motif),
        commentaire: d.commentaire || null,
        ancienneteJours: d.anciennete_jours,
        pointsPerdus: d.points_perdus,
        stories: d.stories,
        venuParAmi: d.venu_par_ami,
      })),
    },
    avis: {
      nombre: avis.nombre,
      moyenne: avis.moyenne,
      etoiles: avis.etoiles,
      commentaires: avis.commentaires.slice(0, 12).map((c) => ({ ...c, pseudo: profils[c.user_id]?.pseudo || null, user_id: undefined })),
    },
    support: {
      aRepondre: fils.filter((f) => f.aRepondre && !f.interne).length,
      total: fils.filter((f) => !f.interne).length,
      fils: fils.slice(0, 40).map((f) => ({ ...f, messages: f.messages.slice(-30) })),
    },
    clubs: {
      resume: resumeClubs(etabs),
      nouveauxCeMois: etabs.filter((e) => jourLocal(e.created_at)?.slice(0, 7) === mois).length,
      liste: listeClubs,
    },
    demos: {
      periodes: resumePeriodes(demos.map((d) => d.created_at), maintenant),
      derniers: demos.slice(0, 20),
    },
  });
}

async function actionRepondre(request, response) {
  let corps = {};
  try {
    corps = await readBody(request);
  } catch {
    return json(response, { error: "Invalid JSON body" }, 400);
  }
  const userId = String(corps.userId || "");
  const message = String(corps.message || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return json(response, { error: "Destinataire invalide" }, 400);
  if (!message || message.length > 2000) return json(response, { error: "Message vide ou trop long" }, 400);

  let cb;
  try {
    cb = getSupabaseClubbeurAdmin();
  } catch {
    return json(response, { error: "Configuration serveur incomplete" }, 500);
  }

  // On ne repond que dans une conversation qui existe : pas de message
  // spontane vers un compte au hasard.
  const { data: fil, error: erreurFil } = await cb.from("support_messages").select("id").eq("user_id", userId).limit(1);
  if (erreurFil) return json(response, { error: erreurFil.message }, 500);
  if (!fil?.length) return json(response, { error: "Conversation introuvable" }, 404);

  const { error } = await cb.from("support_messages").insert({ user_id: userId, message, auteur: "admin" });
  if (error) return json(response, { error: error.message }, 500);

  const push = await pousserA(userId, { type: "support_reponse" });
  return json(response, { ok: true, push: push.envoyees || 0 });
}

/* ?action=pilotage-valider — valider ou refuser un contenu depuis le tableau
   de bord (Julien, 14/09/2026 : « que je puisse valider des stories ici »).

   { source: "appli", id: story, approve }
     Base clubbeur, RPC pilotage_review_story (migration 0046) : points au
     forfait de story_points, verrou contre le double credit, trace du refus.
     Le contenu remonte cote gerants (Reel / TikTok avec lien) suit la meme
     decision, et le clubbeur est notifie.
   { source: "site", id: submission, approve }
     Lien envoye depuis scan.html : base des gerants seulement, points au
     bareme du club sur les vues annoncees -- ce que faisait admin.html. */
async function actionValider(request, response, b2b) {
  let corps = {};
  try {
    corps = await readBody(request);
  } catch {
    return json(response, { error: "Invalid JSON body" }, 400);
  }
  const id = String(corps.id || "");
  const approve = corps.approve === true ? true : corps.approve === false ? false : null;
  if (!/^[0-9a-f-]{36}$/i.test(id) || approve === null) {
    return json(response, { error: "Contenu ou décision manquant" }, 400);
  }

  if (corps.source === "site") {
    const { data: contenu, error } = await b2b
      .from("submissions")
      .select("id, establishment_id, content_type, declared_views, status, external_story_id")
      .eq("id", id)
      .maybeSingle();
    if (error) return json(response, { error: error.message }, 500);
    if (!contenu) return json(response, { error: "Contenu introuvable." }, 404);
    if (contenu.external_story_id) return json(response, { error: "Ce contenu vient de l'appli : valide-le dans la liste de l'appli." }, 409);
    if (contenu.status !== "pending") return json(response, { error: "Ce contenu a déjà été traité." }, 409);

    const miseAJour = { status: approve ? "validated" : "rejected" };
    if (approve) {
      const { data: regles } = await b2b
        .from("establishment_point_rules")
        .select("video_views_per_thousand, story_views_per_thousand, viral_bonus")
        .eq("establishment_id", contenu.establishment_id)
        .maybeSingle();
      const rules = {
        videoViewsPerThousand: Number(regles?.video_views_per_thousand ?? DEFAULT_POINT_RULES.videoViewsPerThousand),
        storyViewsPerThousand: Number(regles?.story_views_per_thousand ?? DEFAULT_POINT_RULES.storyViewsPerThousand),
        viralBonus: Number(regles?.viral_bonus ?? DEFAULT_POINT_RULES.viralBonus),
      };
      const vues = Number(contenu.declared_views) || 0;
      miseAJour.views_count = vues;
      miseAJour.points_awarded = computePoints({ views: vues, contentType: contenu.content_type, rules }).points;
    }
    // .eq("status", "pending") : deux clics simultanes ne decident pas deux fois.
    const { error: erreurMaj } = await b2b.from("submissions").update(miseAJour).eq("id", id).eq("status", "pending");
    if (erreurMaj) return json(response, { error: erreurMaj.message }, 500);
    return json(response, { ok: true, points: miseAJour.points_awarded || 0, notifie: 0 });
  }

  let cb;
  try {
    cb = getSupabaseClubbeurAdmin();
  } catch {
    return json(response, { error: "Configuration serveur incomplete" }, 500);
  }

  // La meme decision que la validation automatique a 24 h (lib/admin/deciderContenu.js).
  const r = await deciderStory({ clubbeur: cb, gerants: b2b, storyId: id, approve });
  if (!r.ok) return json(response, { error: r.message }, r.code === "deja" ? 409 : r.code === "introuvable" ? 404 : 500);
  return json(response, { ok: true, points: r.points, notifie: r.notifie });
}

/* Effacer une conversation du support une fois le probleme regle (Julien,
   16/09/2026 : « une fois le probleme regle, il faut que la conversation
   s'efface »). Seuls les MESSAGES partent : les avis sur l'appli, ranges dans
   la meme table, restent (ils nourrissent la rubrique Avis). Le clubbeur
   retrouve un Aide & Support vierge, avec les questions. */
async function actionEffacerConversation(request, response) {
  let corps = {};
  try {
    corps = await readBody(request);
  } catch {
    return json(response, { error: "Invalid JSON body" }, 400);
  }
  const userId = String(corps.userId || "");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return json(response, { error: "Conversation invalide" }, 400);
  let cb;
  try {
    cb = getSupabaseClubbeurAdmin();
  } catch {
    return json(response, { error: "Configuration serveur incomplete" }, 500);
  }
  const { data, error } = await cb
    .from("support_messages")
    .delete()
    .eq("user_id", userId)
    .not("message", "like", "Avis sur l'appli%")
    .not("message", "like", "Commentaire sur l'appli%")
    .select("id");
  if (error) return json(response, { error: error.message }, 500);
  return json(response, { ok: true, effaces: (data || []).length });
}
