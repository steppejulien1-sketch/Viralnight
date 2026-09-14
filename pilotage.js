import { isSupabaseConfigured, supabase } from "./supabaseClient.js";
import { libelleEcheance } from "./lib/admin/pilotage.js";

/* Le tableau de bord de pilotage (13/09/2026). Voir pilotage.html.
   Tout vient d'UNE route admin : /api/update-client-status?action=pilotage.
   ⚠️ ADMIN_EMAIL est duplique dans admin.js, auth.js et
   api/update-client-status.js : les garder alignes. Le vrai verrou est cote
   serveur ; ici il sert seulement a ne pas montrer un ecran vide. */
const ADMIN_EMAIL = "steppejulien1@gmail.com";
const API = "/api/update-client-status";
const RAFRAICHIR_MS = 2 * 60 * 1000;

const $ = (s) => document.querySelector(s);

let session = null;
let donnees = null;
let chargement = false;
let minuteur = null;
let recuperation = false;
const filsOuverts = new Set();
const brouillons = new Map();

/* ---------------- Mise en forme ---------------- */

function esc(texte) {
  return String(texte ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// U+202F (espace fine) remplace par l'insecable ordinaire, comme dans l'appli.
function nb(n) {
  return typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("fr-FR").replace(/ /g, " ") : "—";
}

function pluriel(n, mot, motPluriel = mot + "s") {
  return `${nb(n)} ${n > 1 ? motPluriel : mot}`;
}

const JOUR_PARIS = (d) => d.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });

function dateCourte(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const maintenant = new Date();
  const heure = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  if (JOUR_PARIS(d) === JOUR_PARIS(maintenant)) return `aujourd’hui, ${heure}`;
  if (JOUR_PARIS(d) === JOUR_PARIS(new Date(maintenant.getTime() - 86400000))) return `hier, ${heure}`;
  const memeAnnee = d.getFullYear() === maintenant.getFullYear();
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: memeAnnee ? undefined : "numeric", timeZone: "Europe/Paris" });
}

function jourLisible(jour) {
  const d = new Date(`${jour}T12:00:00Z`);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
}

function anciennete(jours) {
  if (typeof jours !== "number") return "—";
  if (jours < 1) return "moins d’un jour";
  if (jours < 31) return pluriel(jours, "jour");
  const mois = Math.floor(jours / 30);
  return pluriel(mois, "mois", "mois");
}

const vide = (texte) => `<p class="pl-vide">${esc(texte)}</p>`;

/* ---------------- Connexion ---------------- */

function message(texte) {
  $("#pl-message").textContent = texte || "";
}

function afficher(connecte) {
  $("#pl-connexion").hidden = connecte;
  $("#pl-page").hidden = !connecte;
  $("#pl-compte").hidden = !connecte;
}

function router() {
  const email = session?.user?.email?.toLowerCase() || "";
  if (session && email === ADMIN_EMAIL && !recuperation) {
    afficher(true);
    charger();
    clearInterval(minuteur);
    minuteur = setInterval(() => {
      if (document.visibilityState === "visible") charger();
    }, RAFRAICHIR_MS);
    return;
  }
  clearInterval(minuteur);
  afficher(false);
  if (session && email !== ADMIN_EMAIL && !recuperation) {
    message(`Tu es connecté avec ${email}, qui n’est pas le compte administrateur. Connecte-toi avec ${ADMIN_EMAIL}.`);
    $("#pl-email").value = ADMIN_EMAIL;
  }
}

function modeRecuperation() {
  recuperation = true;
  afficher(false);
  $("#pl-champ-mdp").hidden = true;
  $("#pl-champ-nouveau").hidden = false;
  $("#pl-oubli").hidden = true;
  $("#pl-valider").textContent = "Enregistrer le mot de passe";
  $("#pl-email").value = session?.user?.email || ADMIN_EMAIL;
  message("Choisis un nouveau mot de passe (8 caractères minimum).");
}

$("#pl-form").addEventListener("submit", async (evenement) => {
  evenement.preventDefault();
  if (!supabase) return;
  const bouton = $("#pl-valider");
  bouton.disabled = true;
  try {
    if (recuperation) {
      const nouveau = $("#pl-nouveau").value;
      if (nouveau.length < 8) return message("Le mot de passe doit faire au moins 8 caractères.");
      const { error } = await supabase.auth.updateUser({ password: nouveau });
      if (error) return message("Le mot de passe n’a pas pu être enregistré. Redemande un lien.");
      recuperation = false;
      $("#pl-champ-mdp").hidden = false;
      $("#pl-champ-nouveau").hidden = true;
      $("#pl-oubli").hidden = false;
      bouton.textContent = "Se connecter";
      message("");
      router();
      return;
    }

    const email = $("#pl-email").value.trim().toLowerCase();
    const mdp = $("#pl-mdp").value;
    if (email !== ADMIN_EMAIL) return message(`Seul le compte ${ADMIN_EMAIL} a accès au pilotage.`);
    if (!mdp) return message("Entre le mot de passe.");
    if (session) await supabase.auth.signOut();
    message("Connexion…");
    const { error } = await supabase.auth.signInWithPassword({ email, password: mdp });
    if (error) return message("Connexion impossible. Vérifie l’e-mail et le mot de passe.");
    $("#pl-mdp").value = "";
    message("");
  } finally {
    bouton.disabled = false;
  }
});

$("#pl-oubli").addEventListener("click", async () => {
  if (!supabase) return;
  const email = $("#pl-email").value.trim().toLowerCase() || ADMIN_EMAIL;
  if (email !== ADMIN_EMAIL) return message(`Seul le compte ${ADMIN_EMAIL} a accès au pilotage.`);
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: new URL("./pilotage.html", window.location.href).href,
  });
  message(error ? "Le lien n’a pas pu être envoyé. Réessaie dans un moment." : `Lien envoyé à ${email}. Ouvre-le pour choisir un nouveau mot de passe.`);
});

$("#pl-deconnexion").addEventListener("click", async () => {
  if (supabase) await supabase.auth.signOut();
});

$("#pl-actualiser").addEventListener("click", () => charger());

/* ---------------- Donnees ---------------- */

async function appelApi(chemin, options = {}) {
  const { data } = await supabase.auth.getSession();
  const jeton = data.session?.access_token;
  if (!jeton) throw new Error("Session expirée. Reconnecte-toi.");
  const res = await fetch(chemin, {
    ...options,
    headers: { Authorization: `Bearer ${jeton}`, ...(options.body ? { "Content-Type": "application/json" } : {}) },
  });
  const corps = await res.json().catch(() => ({}));
  if (res.status === 403) throw new Error("Ce compte n’est pas reconnu comme administrateur.");
  if (!res.ok) throw new Error(corps.error || `Erreur ${res.status}`);
  return corps;
}

// Une actualisation demandee pendant qu'une autre tourne n'est pas perdue :
// sans ca, deux decisions coup sur coup laissaient la seconde a l'ecran,
// comme si elle n'avait pas ete prise.
let aRecharger = false;

async function charger() {
  if (chargement) {
    aRecharger = true;
    return;
  }
  chargement = true;
  $("#pl-actualiser").disabled = true;
  $("#pl-actualiser").textContent = "Actualisation…";
  try {
    donnees = await appelApi(`${API}?action=pilotage`);
    rendre();
    const heure = new Date(donnees.genereLe).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    $("#pl-maj").textContent = `Mis à jour à ${heure}`;
  } catch (e) {
    const alerte = $("#pl-erreurs");
    alerte.hidden = false;
    alerte.textContent = `Les données n’ont pas pu être chargées : ${e.message}`;
  } finally {
    chargement = false;
    $("#pl-chargement").hidden = true;
    $("#pl-actualiser").disabled = false;
    $("#pl-actualiser").textContent = "Actualiser";
    if (aRecharger) {
      aRecharger = false;
      charger();
    }
  }
}

/* ---------------- Rendu ---------------- */

function kpi({ libelle, valeur, suffixe = "", detail = "", traiter = false }) {
  const v = typeof valeur === "number" ? nb(valeur) : esc(valeur);
  return `<div class="pl-kpi${traiter ? " a-traiter" : ""}">
    <p class="pl-kpi-libelle">${esc(libelle)}</p>
    <p class="pl-kpi-valeur">${v}${suffixe ? `<small>${esc(suffixe)}</small>` : ""}</p>
    <p class="pl-kpi-detail">${esc(detail)}</p>
  </div>`;
}

function chiffre(valeur, libelle) {
  return `<div class="pl-chiffre"><b>${typeof valeur === "number" ? nb(valeur) : esc(valeur)}</b><span>${esc(libelle)}</span></div>`;
}

/* Barres en SVG etire (preserveAspectRatio none) : les dates sont ecrites
   en HTML dessous, sinon le texte serait deforme avec les barres. */
function graphe(serie) {
  if (!serie?.length) return vide("Aucune donnée.");
  const max = Math.max(1, ...serie.map((s) => s.n));
  const larg = 100 / serie.length;
  const barres = serie
    .map((s, i) => {
      const h = s.n ? Math.max(2, (s.n / max) * 100) : 0;
      const x = i * larg + larg * 0.14;
      const w = larg * 0.72;
      const aujourdhui = i === serie.length - 1 ? " aujourdhui" : "";
      return `<rect class="fond" x="${x}" y="99" width="${w}" height="1"></rect>` +
        (h ? `<rect class="b${aujourdhui}" x="${x}" y="${100 - h}" width="${w}" height="${h}" rx="0.4"><title>${esc(jourLisible(s.jour))} : ${s.n}</title></rect>` : "");
    })
    .join("");
  const total = serie.reduce((t, s) => t + s.n, 0);
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="${esc(`${total} sur ${serie.length} jours, maximum ${max} en un jour`)}">${barres}</svg>
    <div style="display:flex;justify-content:space-between;margin-top:6px;color:var(--encre-3);font-size:11.5px">
      <span>${esc(jourLisible(serie[0].jour))}</span><span>max ${nb(max)} par jour</span><span>aujourd’hui</span>
    </div>`;
}

function barres(lignes) {
  const max = Math.max(1, ...lignes.map((l) => l.n));
  return lignes
    .map((l) => `<div class="pl-barre">
      <span class="pl-barre-libelle">${esc(l.libelle)}</span>
      <span class="pl-barre-n">${nb(l.n)}${typeof l.part === "number" ? ` · ${l.part} %` : ""}</span>
      <span class="pl-barre-piste"><i style="width:${(l.n / max) * 100}%"></i></span>
    </div>`)
    .join("");
}

function tableau(entetes, lignes, texteVide) {
  if (!lignes.length) return `<tbody><tr><td>${vide(texteVide)}</td></tr></tbody>`;
  const tete = `<thead><tr>${entetes.map((e) => `<th${e.n ? ' class="n"' : ""}>${esc(e.t)}</th>`).join("")}</tr></thead>`;
  return `${tete}<tbody>${lignes.join("")}</tbody>`;
}

function rendre() {
  const d = donnees;
  const alerte = $("#pl-erreurs");
  alerte.hidden = !d.erreurs?.length;
  alerte.textContent = d.erreurs?.length ? `Certaines données n’ont pas pu être lues : ${d.erreurs.join(" · ")}` : "";

  const c = d.clubbeurs;
  const a = d.appli;
  const cl = d.clubs.resume;

  $("#pl-kpis").innerHTML = [
    kpi({
      libelle: "À valider",
      valeur: d.validation.aValider,
      detail: d.validation.aValider ? "stories et publications en attente" : "Rien en attente",
      traiter: d.validation.aValider > 0,
    }),
    kpi({ libelle: "Inscrits aujourd’hui", valeur: c.periodes.aujourdhui, detail: `7 derniers jours : ${nb(c.periodes.septJours)}` }),
    kpi({ libelle: "Inscrits ce mois-ci", valeur: c.periodes.ceMois, detail: `Mois dernier : ${nb(c.periodes.moisDernier)}` }),
    kpi({ libelle: "Clubbeurs au total", valeur: c.periodes.total, detail: `${nb(c.parraines)} venus par un ami` }),
    kpi({ libelle: "Installations de l’appli", valeur: a.installations.periodes.total, detail: `Ce mois-ci : ${nb(a.installations.periodes.ceMois)}` }),
    kpi({ libelle: "Actifs aujourd’hui", valeur: a.actifs.jour, detail: `7 jours : ${nb(a.actifs.semaine)} · 30 jours : ${nb(a.actifs.mois)}` }),
    kpi({ libelle: "Comptes supprimés ce mois-ci", valeur: d.departs.periodes.ceMois, detail: `Depuis le début : ${nb(d.departs.periodes.total)}` }),
    kpi({ libelle: "Établissements payants", valeur: cl.payant, suffixe: ` / ${nb(cl.total)}`, detail: `En essai : ${nb(cl.essai)} · suspendus : ${nb(cl.suspendu)}` }),
    kpi({ libelle: "Support à traiter", valeur: d.support.aRepondre, detail: pluriel(d.support.total, "conversation"), traiter: d.support.aRepondre > 0 }),
    kpi({
      libelle: "Note de l’appli",
      valeur: d.avis.moyenne === null ? "—" : String(d.avis.moyenne).replace(".", ","),
      suffixe: d.avis.moyenne === null ? "" : " / 5",
      detail: pluriel(d.avis.nombre, "note"),
    }),
    kpi({ libelle: "Demandes de démo ce mois-ci", valeur: d.demos.periodes.ceMois, detail: `Depuis le début : ${nb(d.demos.periodes.total)}` }),
  ].join("");

  const pastille = $("#pl-pastille-support");
  pastille.hidden = !d.support.aRepondre;
  pastille.textContent = d.support.aRepondre || "";
  const pastilleValider = $("#pl-pastille-valider");
  pastilleValider.hidden = !d.validation.aValider;
  pastilleValider.textContent = d.validation.aValider || "";

  rendreValidation();
  rendreEmails();

  // --- Clubbeurs ---
  $("#pl-graphe-inscrits").innerHTML = graphe(c.serie);
  $("#pl-chiffres-inscrits").innerHTML = [
    chiffre(c.periodes.aujourdhui, "aujourd’hui"),
    chiffre(c.periodes.septJours, "7 jours"),
    chiffre(c.periodes.ceMois, "ce mois-ci"),
    chiffre(c.periodes.moisDernier, "mois dernier"),
    chiffre(c.notifsActives, "notifications activées"),
    chiffre(c.pointsEnCirculation, "points en circulation"),
  ].join("");
  $("#pl-derniers-inscrits").innerHTML = c.derniers.length
    ? c.derniers.map((u) => `<li><span class="pl-texte">${u.pseudo ? "@" + esc(u.pseudo) : "Sans pseudo"}${u.parraine ? ' <span class="pl-sujet">par un ami</span>' : ""}</span><span class="pl-meta">${esc(dateCourte(u.date))}</span></li>`).join("")
    : `<li>${vide("Aucun clubbeur inscrit pour l’instant.")}</li>`;

  // --- Appli ---
  $("#pl-graphe-actifs").innerHTML = graphe(a.actifs.serie);
  $("#pl-chiffres-actifs").innerHTML = [chiffre(a.actifs.jour, "aujourd’hui"), chiffre(a.actifs.semaine, "7 jours"), chiffre(a.actifs.mois, "30 jours")].join("");
  $("#pl-chiffres-installations").innerHTML = [
    chiffre(a.installations.periodes.total, "au total"),
    chiffre(a.installations.periodes.ceMois, "ce mois-ci"),
    chiffre(a.installations.periodes.aujourdhui, "aujourd’hui"),
  ].join("");
  const p = a.installations.plateformes;
  $("#pl-plateformes").innerHTML = barres(
    [
      { libelle: "iPhone", n: p.iphone },
      { libelle: "Android", n: p.android },
      { libelle: "Ordinateur", n: p.ordinateur },
      { libelle: "Autre", n: p.autre },
    ].filter((l) => l.libelle !== "Autre" || l.n)
  );

  // --- Activite ---
  const act = d.activite;
  $("#pl-activite").innerHTML = [
    kpi({ libelle: "Stories ce mois-ci", valeur: act.stories.ceMois, detail: `Aujourd’hui : ${nb(act.stories.aujourdhui)} · total : ${nb(act.stories.total)}` }),
    kpi({ libelle: "Stories validées", valeur: act.storiesValidees, detail: `sur ${pluriel(act.stories.total, "story", "stories")}` }),
    kpi({ libelle: "Points distribués ce mois-ci", valeur: act.points.ceMois, detail: `Depuis le début : ${nb(act.points.total)}` }),
    kpi({ libelle: "Récompenses échangées ce mois-ci", valeur: act.recompenses.ceMois, detail: `Depuis le début : ${nb(act.recompenses.total)}` }),
    kpi({ libelle: "Cadeaux du jour ouverts ce mois-ci", valeur: act.cadeaux.ceMois, detail: `Aujourd’hui : ${nb(act.cadeaux.aujourdhui)}` }),
  ].join("");

  // --- Departs ---
  const dep = d.departs;
  $("#pl-departs-total").textContent = dep.periodes.total ? `${pluriel(dep.periodes.total, "compte")} au total` : "";
  $("#pl-motifs").innerHTML = dep.periodes.total ? barres(dep.motifs) : vide("Aucun compte supprimé pour l’instant.");
  $("#pl-table-departs").innerHTML = tableau(
    [{ t: "Date" }, { t: "Raison" }, { t: "Ancienneté" }, { t: "Points perdus", n: true }, { t: "Stories", n: true }],
    dep.derniers.map((x) => `<tr>
      <td class="pl-gris">${esc(dateCourte(x.date))}</td>
      <td class="pl-long"><span class="pl-nom">${esc(x.motif)}</span>${x.commentaire ? `<br><span class="pl-gris">« ${esc(x.commentaire)} »</span>` : ""}${x.venuParAmi ? '<br><span class="pl-gris">venu par un ami</span>' : ""}</td>
      <td class="pl-gris">${esc(anciennete(x.ancienneteJours))}</td>
      <td class="n">${nb(x.pointsPerdus)}</td>
      <td class="n">${nb(x.stories)}</td>
    </tr>`),
    "Personne n’a encore supprimé son compte."
  );

  rendreSupport();

  // --- Avis ---
  const av = d.avis;
  $("#pl-avis-note").innerHTML = `<div class="pl-carte-tete"><h3>Note moyenne</h3><span>${esc(pluriel(av.nombre, "note"))}</span></div>` +
    (av.nombre
      ? `<div class="pl-note-grande"><b>${esc(String(av.moyenne).replace(".", ","))}</b><span>/ 5</span></div>` +
        barres([5, 4, 3, 2, 1].map((n) => ({ libelle: `${n} étoile${n > 1 ? "s" : ""}`, n: av.etoiles[n] })))
      : vide("Aucune note laissée dans l’appli."));
  $("#pl-commentaires").innerHTML = av.commentaires.length
    ? av.commentaires.map((x) => `<li><span class="pl-texte">${esc(x.texte)}<br><span class="pl-meta">${x.note}/5${x.pseudo ? " · @" + esc(x.pseudo) : ""}</span></span><span class="pl-meta">${esc(dateCourte(x.date))}</span></li>`).join("")
    : `<li>${vide("Aucun commentaire.")}</li>`;

  // --- Clubs ---
  $("#pl-clubs-resume").innerHTML = [
    kpi({ libelle: "Payants", valeur: cl.payant }),
    kpi({ libelle: "En essai gratuit", valeur: cl.essai }),
    kpi({ libelle: "Suspendus", valeur: cl.suspendu }),
    kpi({ libelle: "Nouveaux ce mois-ci", valeur: d.clubs.nouveauxCeMois }),
  ].join("");
  $("#pl-table-clubs").innerHTML = tableau(
    [{ t: "Établissement" }, { t: "Statut" }, { t: "Contact du gérant" }, { t: "Depuis" }, { t: "Récompenses", n: true }, { t: "Stories", n: true }, { t: "Clubbeurs", n: true }, { t: "Instagram" }, { t: "Dernière activité" }],
    d.clubs.liste.map((x) => `<tr>
      <td><span class="pl-nom">${esc(x.nom)}</span><br><span class="pl-gris">${esc([x.ville, x.type].filter(Boolean).join(" · ") || "—")}</span></td>
      <td><select class="pl-select ${esc(x.statutCode)}" data-club="${esc(x.id)}" data-avant="${esc(x.statut)}" aria-label="Statut de ${esc(x.nom)}">
        <option value="actif"${x.statut === "actif" ? " selected" : ""}>Payant</option>
        <option value="essai"${x.statut === "essai" ? " selected" : ""}>Essai gratuit</option>
        <option value="suspendu"${x.statut === "suspendu" ? " selected" : ""}>Suspendu</option>
      </select></td>
      <td><div class="pl-contact">
        ${x.proprietaire ? x.proprietaire.split(", ").map((m) => `<a href="mailto:${esc(m)}">${esc(m)}</a>`).join("") : '<span class="pl-gris">Aucun compte gérant</span>'}
        ${x.telephone ? `<a href="tel:${esc(x.telephone.replace(/[^0-9+]/g, ""))}">${esc(x.telephone)}</a>${x.telephoneDeLaDemo ? '<span class="pl-gris">numéro de sa demande de démo</span>' : ""}` : '<span class="pl-gris">Pas de numéro</span>'}
      </div></td>
      <td class="pl-gris">${esc(dateCourte(x.depuis))}</td>
      <td class="n">${nb(x.recompenses)}</td>
      <td class="n">${nb(x.stories)}</td>
      <td class="n">${nb(x.clubbeurs)}</td>
      <td class="pl-gris">${x.instagram ? "Relié" : "Non"}</td>
      <td class="pl-gris">${esc(dateCourte(x.derniereActivite))}</td>
    </tr>`),
    "Aucun établissement inscrit pour l’instant."
  );

  // --- Demos ---
  $("#pl-table-demos").innerHTML = tableau(
    [{ t: "Établissement" }, { t: "Téléphone" }, { t: "E-mail" }, { t: "Date" }],
    d.demos.derniers.map((x) => `<tr>
      <td class="pl-nom pl-long">${esc(x.club || "—")}</td>
      <td>${x.phone ? `<a href="tel:${esc(x.phone)}">${esc(x.phone)}</a>` : "—"}</td>
      <td>${x.email ? `<a href="mailto:${esc(x.email)}">${esc(x.email)}</a>` : "—"}</td>
      <td class="pl-gris">${esc(dateCourte(x.created_at))}</td>
    </tr>`),
    "Aucune demande de démo."
  );
}

/* ---------------- Export des etablissements ---------------- */

// Point-virgule et BOM : c'est ce qu'Excel en francais ouvre sans melanger
// les colonnes ni casser les accents.
function exporterEtablissements() {
  if (!donnees) return;
  const cellule = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lignes = [["Établissement", "Ville", "Type", "Statut", "E-mail du gérant", "Téléphone", "Inscrit le", "Stories", "Clubbeurs"]]
    .concat(donnees.clubs.liste.map((x) => [
      x.nom, x.ville, x.type, x.statutLibelle, x.proprietaire, x.telephone,
      x.depuis ? new Date(x.depuis).toLocaleDateString("fr-FR") : "", x.stories, x.clubbeurs,
    ]));
  const csv = "﻿" + lignes.map((l) => l.map(cellule).join(";")).join("\r\n");
  const lien = document.createElement("a");
  lien.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  lien.download = `etablissements-noctify-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(lien);
  lien.click();
  setTimeout(() => { URL.revokeObjectURL(lien.href); lien.remove(); }, 1000);
}

$("#pl-export-clubs").addEventListener("click", exporterEtablissements);

/* ---------------- A valider ---------------- */

const JOUR_MS = 86400000;

function lienSur(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

function ligneContenu(x, source) {
  const pseudo = x.pseudo ? `@${esc(x.pseudo)}` : source === "site" ? "Client du site" : "Sans pseudo";
  const liens = [];
  if (x.pseudo) liens.push(`<a href="https://www.instagram.com/${encodeURIComponent(x.pseudo)}/" target="_blank" rel="noreferrer">Instagram de ${pseudo}</a>`);
  const url = x.url && lienSur(x.url);
  if (url) liens.push(`<a href="${esc(url)}" target="_blank" rel="noreferrer">Voir la publication</a>`);
  // Dans la liste de l'appli, l'etablissement est deja le titre du groupe.
  const meta = [source === "site" ? x.club : null, dateCourte(x.date)].filter(Boolean).map(esc).join(" · ") + (liens.length ? ` · ${liens.join(" · ")}` : "");
  const echeance = source === "appli" ? libelleEcheance(x.date) : null;
  const expiree = x.kind === "story" && Date.now() - new Date(x.date).getTime() > JOUR_MS;
  const points = source === "site"
    ? (typeof x.vuesAnnoncees === "number" ? `${nb(x.vuesAnnoncees)} vues annoncées` : "")
    : (typeof x.points === "number" ? ` · +${nb(x.points)}` : "");
  return `<div class="pl-contenu" data-contenu="${esc(x.id)}" data-source="${source}">
    <div>
      <p class="pl-contenu-titre"><span class="pl-sujet">${esc(x.type)}</span> <strong>${pseudo}</strong>${x.interne ? "<em>ton compte</em>" : ""}</p>
      <p class="pl-contenu-meta">${meta}${source === "site" && points ? ` · ${esc(points)}` : ""}</p>
      ${expiree ? '<p class="pl-contenu-alerte">Plus de 24 h : la story n’est plus visible sur Instagram.</p>' : ""}
      ${echeance ? `<p class="pl-contenu-auto">${esc(echeance)}</p>` : ""}
    </div>
    <div class="pl-contenu-actions">
      <button type="button" class="pl-bouton" data-decision="valider">Valider${source === "site" ? "" : esc(points)}</button>
      <button type="button" class="pl-bouton-leger" data-decision="refuser">Refuser</button>
      <span class="pl-contenu-etat" role="status"></span>
    </div>
  </div>`;
}

function rendreValidation() {
  const v = donnees.validation;
  $("#pl-valider-resume").textContent = v.appli.length ? pluriel(v.appli.length, "contenu") + " en attente" : "";
  // Une liste par etablissement (Julien, 14/09/2026 : « a chaque etablissement
  // qui arrive, qu'il y ait une liste differente »), le plus charge en haut.
  const groupes = new Map();
  for (const x of v.appli) {
    const cle = x.clubId || "sans";
    if (!groupes.has(cle)) groupes.set(cle, { club: x.club || "Sans établissement", instagram: x.instagramRelie, contenus: [] });
    groupes.get(cle).contenus.push(x);
  }
  $("#pl-a-valider").innerHTML = v.appli.length
    ? [...groupes.values()]
        .sort((a, b) => b.contenus.length - a.contenus.length || a.club.localeCompare(b.club, "fr"))
        .map((g) => `<div class="pl-groupe">
          <div class="pl-groupe-tete">
            <strong>${esc(g.club)}</strong>
            <span>${esc(pluriel(g.contenus.length, "contenu"))} · ${g.instagram ? "Instagram relié : les mentions arrivent toutes seules" : "Instagram non relié : vérifie à la main"}</span>
          </div>
          ${g.contenus.map((x) => ligneContenu(x, "appli")).join("")}
        </div>`)
        .join("")
    : vide("Aucune story ni publication à valider.");
  $("#pl-site-carte").hidden = !v.site.length;
  $("#pl-site").innerHTML = v.site.map((x) => ligneContenu(x, "site")).join("");
  $("#pl-decisions").innerHTML = v.decisions.length
    ? v.decisions.map((x) => `<li><span class="pl-texte"><span class="pl-decision ${x.decision}">${x.decision === "refusee" ? "Refusée" : `${x.auto ? "Validée automatiquement" : "Validée"} · +${nb(x.pointsAccordes)}`}</span> — ${esc(x.type)} de ${x.pseudo ? "@" + esc(x.pseudo) : "sans pseudo"}${x.club ? " · " + esc(x.club) : ""}</span><span class="pl-meta">${esc(dateCourte(x.decideLe || x.date))}</span></li>`).join("")
    : `<li>${vide("Aucune décision pour l’instant.")}</li>`;
}

document.addEventListener("click", async (evenement) => {
  const bouton = evenement.target.closest("[data-decision]");
  if (!bouton) return;
  const ligne = bouton.closest("[data-contenu]");
  const approuver = bouton.dataset.decision === "valider";
  if (!approuver && !window.confirm("Refuser ce contenu ? Le clubbeur ne recevra pas de points, et c’est définitif.")) return;
  const etat = ligne.querySelector(".pl-contenu-etat");
  ligne.querySelectorAll("button").forEach((b) => { b.disabled = true; });
  etat.textContent = approuver ? "Validation…" : "Refus…";
  try {
    const r = await appelApi(`${API}?action=pilotage-valider`, {
      method: "POST",
      body: JSON.stringify({ source: ligne.dataset.source, id: ligne.dataset.contenu, approve: approuver }),
    });
    etat.textContent = approuver
      ? `Validé : +${nb(r.points)} points.${r.notifie ? " Clubbeur prévenu." : ""}`
      : `Refusé.${r.notifie ? " Clubbeur prévenu." : ""}`;
    // La ligne part tout de suite (le temps de lire le resultat) ; le reste
    // de la page -- decisions, points, compteurs -- suit a l'actualisation.
    setTimeout(() => {
      ligne.remove();
      const pastille = $("#pl-pastille-valider");
      const reste = document.querySelectorAll("[data-contenu]").length;
      pastille.hidden = !reste;
      pastille.textContent = reste || "";
      if (!document.querySelector("#pl-a-valider [data-contenu]")) $("#pl-a-valider").innerHTML = vide("Aucune story ni publication à valider.");
    }, 1400);
    charger();
  } catch (e) {
    etat.textContent = `Pas fait : ${e.message}`;
    ligne.querySelectorAll("button").forEach((b) => { b.disabled = false; });
  }
});

/* ---------------- E-mails ---------------- */

const TYPES_EMAIL = { support: "Support", compte_supprime: "Compte supprimé", demo: "Démo" };
const mailsOuverts = new Set();

function rendreEmails() {
  const m = donnees.emails;
  $("#pl-emails-resume").textContent = m.total
    ? `${pluriel(m.total, "e-mail")}${m.nonEnvoyes ? ` · ${nb(m.nonEnvoyes)} pas parti${m.nonEnvoyes > 1 ? "s" : ""}` : ""}`
    : "";
  $("#pl-emails").innerHTML = m.derniers.length
    ? m.derniers.map((e) => {
        const ouvert = mailsOuverts.has(String(e.id));
        return `<div class="pl-mail">
          <button type="button" class="pl-mail-tete" data-mail="${esc(e.id)}" aria-expanded="${ouvert}">
            <span class="pl-mail-sujet"><span class="pl-sujet">${esc(TYPES_EMAIL[e.type] || e.type)}</span>${esc(e.sujet)}</span>
            <span class="pl-mail-date">${esc(dateCourte(e.date))}</span>
            <span class="pl-mail-statut${e.envoye ? "" : " echec"}">${e.envoye ? "Envoyé dans ta boîte mail" : `Pas envoyé : ${esc(e.erreur || "raison inconnue")}`}</span>
          </button>
          <div class="pl-mail-corps"${ouvert ? "" : " hidden"}>${esc(e.texte || "")}</div>
        </div>`;
      }).join("")
    : vide("Aucun e-mail pour l’instant.");
}

document.addEventListener("click", (evenement) => {
  const tete = evenement.target.closest(".pl-mail-tete");
  if (!tete) return;
  const corps = tete.nextElementSibling;
  const ouvrir = corps.hidden;
  corps.hidden = !ouvrir;
  tete.setAttribute("aria-expanded", String(ouvrir));
  if (ouvrir) mailsOuverts.add(tete.dataset.mail);
  else mailsOuverts.delete(tete.dataset.mail);
});

function rendreSupport() {
  const s = donnees.support;
  $("#pl-support-resume").textContent = s.total ? `${nb(s.aRepondre)} à traiter · ${pluriel(s.total, "conversation")}` : "";

  // Le rafraichissement automatique reconstruit la liste : on garde ce qui
  // etait en train d'etre ecrit, et les conversations ouvertes.
  document.querySelectorAll(".pl-repondre textarea").forEach((t) => brouillons.set(t.dataset.user, t.value));

  $("#pl-fils").innerHTML = s.fils.length
    ? s.fils.map((f) => {
        const ouvert = filsOuverts.has(f.user_id);
        const qui = f.pseudo ? `@${esc(f.pseudo)}` : "Sans pseudo";
        const dernier = f.messages[f.messages.length - 1];
        const extrait = dernier.message.replace(/^\[[^\]]{1,40}\]\s*/, "");
        return `<div class="pl-fil">
          <button type="button" class="pl-fil-tete" data-fil="${esc(f.user_id)}" aria-expanded="${ouvert}">
            <span class="pl-fil-qui">${qui}${f.email ? ` <em>${esc(f.email)}</em>` : ""}${f.aRepondre ? '<span class="pl-a-repondre">À traiter</span>' : ""}</span>
            <span class="pl-fil-date">${esc(dateCourte(f.dernier))}</span>
            <span class="pl-fil-extrait">${f.sujet ? `<span class="pl-sujet">${esc(f.sujet)}</span>` : ""}${dernier.auteur === "admin" ? "Toi : " : ""}${esc(extrait)}</span>
          </button>
          <div class="pl-fil-corps"${ouvert ? "" : " hidden"}>
            <div class="pl-bulles">${f.messages.map((m) => `<div class="pl-bulle ${m.auteur}">${esc(m.message)}<small>${m.auteur === "admin" ? "Toi · " : ""}${esc(dateCourte(m.date))}</small></div>`).join("")}</div>
            <form class="pl-repondre" data-user="${esc(f.user_id)}">
              <textarea data-user="${esc(f.user_id)}" maxlength="2000" placeholder="Ta réponse…" aria-label="Réponse à ${qui}"></textarea>
              <div class="pl-repondre-ligne"><span class="pl-repondre-etat"></span><button type="submit" class="pl-bouton">Envoyer la réponse</button></div>
            </form>
          </div>
        </div>`;
      }).join("")
    : vide("Aucun message au support pour l’instant.");

  document.querySelectorAll(".pl-repondre textarea").forEach((t) => {
    if (brouillons.has(t.dataset.user)) t.value = brouillons.get(t.dataset.user);
  });
  document.querySelectorAll(".pl-fil.ouvert-auto .pl-bulles, .pl-fil-corps:not([hidden]) .pl-bulles").forEach((b) => { b.scrollTop = b.scrollHeight; });
}

document.addEventListener("click", (evenement) => {
  const tete = evenement.target.closest(".pl-fil-tete");
  if (!tete) return;
  const id = tete.dataset.fil;
  const corps = tete.nextElementSibling;
  const ouvrir = corps.hidden;
  corps.hidden = !ouvrir;
  tete.setAttribute("aria-expanded", String(ouvrir));
  if (ouvrir) {
    filsOuverts.add(id);
    const bulles = corps.querySelector(".pl-bulles");
    bulles.scrollTop = bulles.scrollHeight;
  } else {
    filsOuverts.delete(id);
  }
});

document.addEventListener("submit", async (evenement) => {
  const form = evenement.target.closest(".pl-repondre");
  if (!form) return;
  evenement.preventDefault();
  const zone = form.querySelector("textarea");
  const etat = form.querySelector(".pl-repondre-etat");
  const bouton = form.querySelector("button");
  const texte = zone.value.trim();
  if (!texte) return;
  bouton.disabled = true;
  etat.textContent = "Envoi…";
  try {
    const r = await appelApi(`${API}?action=pilotage-repondre`, { method: "POST", body: JSON.stringify({ userId: form.dataset.user, message: texte }) });
    brouillons.delete(form.dataset.user);
    zone.value = "";
    etat.textContent = r.push ? "Envoyé, et notifié sur son téléphone." : "Envoyé. Il le verra dans Aide & Support (notifications non activées).";
    await charger();
  } catch (e) {
    etat.textContent = `Pas envoyé : ${e.message}`;
  } finally {
    bouton.disabled = false;
  }
});

document.addEventListener("change", async (evenement) => {
  const select = evenement.target.closest(".pl-select[data-club]");
  if (!select) return;
  const avant = select.dataset.avant;
  select.disabled = true;
  try {
    await appelApi(API, { method: "POST", body: JSON.stringify({ establishment_id: select.dataset.club, subscription_status: select.value }) });
    await charger();
  } catch (e) {
    select.value = avant;
    window.alert(`Le statut n’a pas pu être changé : ${e.message}`);
  } finally {
    select.disabled = false;
  }
});

/* ---------------- Demarrage ---------------- */

async function demarrer() {
  if (!isSupabaseConfigured || !supabase) {
    afficher(false);
    message("La connexion à la base n’est pas configurée sur ce site.");
    return;
  }
  supabase.auth.onAuthStateChange((evenement, nouvelle) => {
    session = nouvelle;
    if (evenement === "PASSWORD_RECOVERY") return modeRecuperation();
    if (evenement === "INITIAL_SESSION") return; // deja traite ci-dessous
    router();
  });
  const { data } = await supabase.auth.getSession();
  session = data.session;
  if (!recuperation) router();
}

demarrer();
