import { createClient } from "@supabase/supabase-js";
import { getSupabaseClubbeurAdmin } from "../lib/db/supabaseClubbeurAdmin.js";
import { pousserA } from "../lib/notifications/envoyer.js";
import { libelleMotifDepart } from "../lib/notifications/push.js";
import {
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

/* LA ROUTE ADMIN. Trois choses, toutes reservees a ADMIN_EMAIL :

   POST                         changer le statut d'un club (actif / essai / suspendu)
   GET  ?action=pilotage        le tableau de bord de pilotage.html : les DEUX bases
   POST ?action=pilotage-repondre  repondre a un clubbeur depuis le tableau de bord

   Greffe ici plutot que dans un nouveau fichier : le plan Hobby plafonne a
   12 fonctions serverless et api/ y est deja (voir CLAUDE.md). Ce fichier
   etait deja reserve a l'admin, c'est sa place naturelle.

   ⚠️ L'ADMIN SE PROUVE PAR LE JETON, JAMAIS PAR LE CORPS. Le jeton est relu
   par la base des gerants (getUser) et son e-mail compare a ADMIN_EMAIL.
   Les cles service_role des deux bases contournent RLS : sans ce controle,
   n'importe qui lirait tous les clubs et tous les clubbeurs. */

const ADMIN_EMAIL = "viralnight001@gmail.com";
const ALLOWED_STATUSES = new Set(["actif", "essai", "suspendu"]);

// Les comptes de Julien et ceux de nos outils ne sont pas des clients : les
// compter gonflerait les inscrits, les stories et le support.
const COMPTES_INTERNES = new Set(["viralnight001@gmail.com", "julien.steppe123@gmail.com"]);
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

  if (action === "pilotage" || action === "pilotage-repondre") {
    const attendu = action === "pilotage" ? "GET" : "POST";
    if (request.method !== attendu) return json(response, { error: "Method not allowed" }, 405);
    const admin = await verifierAdmin(request);
    if (admin.error) return json(response, { error: admin.error }, admin.status);
    return action === "pilotage" ? actionPilotage(response, admin.supabase) : actionRepondre(request, response);
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

  const [
    etabs, proprios, recompensesB2B, contenus, scans, instas, demos,
    comptesAuth, users, stories, grants, redemptions, cadeaux, installations, ouvertures, departs, support, abonnements, clubsCb,
  ] = await Promise.all([
    lire("établissements", () => toutLire(() => b2b.from("establishments").select("id, name, city, category, subscription_status, created_at").order("created_at"))),
    lire("propriétaires", () => toutLire(() => b2b.from("establishment_owners").select("email, establishment_id, created_at").order("created_at"))),
    lire("récompenses des clubs", () => toutLire(() => b2b.from("rewards").select("establishment_id, active, created_at").order("created_at"))),
    lire("contenus", () => toutLire(() => b2b.from("submissions").select("establishment_id, submitted_at").order("submitted_at"))),
    lire("scans", () => toutLire(() => b2b.from("qr_scans").select("establishment_id, scanned_at").order("scanned_at"))),
    lire("comptes Instagram", () => toutLire(() => b2b.from("establishment_instagram_accounts").select("establishment_id").order("establishment_id"))),
    lire("demandes de démo", () => toutLire(() => b2b.from("demo_requests").select("club, email, phone, created_at").order("created_at", { ascending: false }))),
    cote("comptes", () => tousLesComptesAuth(cb)),
    cote("clubbeurs", () => toutLire(() => cb.from("users").select("id, handle, email, created_at, points_balance, referred_by").order("created_at"))),
    cote("stories", () => toutLire(() => cb.from("story_events").select("user_id, club_id, mentioned_at, verified").order("mentioned_at"))),
    cote("points", () => toutLire(() => cb.from("point_grants").select("user_id, amount, created_at").order("created_at"))),
    cote("récompenses échangées", () => toutLire(() => cb.from("redemptions").select("user_id, redeemed_at").order("redeemed_at"))),
    cote("cadeaux du jour", () => toutLire(() => cb.from("daily_gifts").select("user_id, created_at").order("created_at"))),
    cote("installations", () => toutLire(() => cb.from("app_evenements").select("appareil, plateforme, created_at").eq("type", "installation").order("id"))),
    cote("ouvertures", () => toutLire(() => cb.from("app_evenements").select("appareil, jour").eq("type", "ouverture").gte("jour", trenteJours).order("id"))),
    cote("départs", () => toutLire(() => cb.from("departs").select("*").order("created_at", { ascending: false }))),
    cote("support", () => toutLire(() => cb.from("support_messages").select("user_id, message, auteur, created_at").order("created_at"))),
    cote("notifications", () => toutLire(() => cb.from("push_subscriptions").select("user_id").order("user_id"))),
    cote("établissements de l'appli", () => toutLire(() => cb.from("clubs").select("id, establishment_id").order("id"))),
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

  const supportClients = support.filter(externe);
  const avis = syntheseAvis(supportClients);
  const fils = filsSupport(supportClients, profils);
  const plateformes = { iphone: 0, android: 0, ordinateur: 0, autre: 0 };
  for (const i of installations) plateformes[plateformes[i.plateforme] === undefined ? "autre" : i.plateforme] += 1;

  return json(response, {
    genereLe: maintenant.toISOString(),
    erreurs,
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
      aRepondre: fils.filter((f) => f.aRepondre).length,
      total: fils.length,
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
