/* Site public Noctify pour les commerces (30/09/2026, v5).

   - La carte noire du premier ecran se tamponne une fois : quatre passages
     (+20), puis la story (+100) qui debloque le cappuccino.
   - Le bandeau des commerces defile : le texte est double ici pour que la
     boucle ne se voie pas.
   - Le bon de l'etape 3 porte un vrai QR code, qui change toutes les 30 s
     comme dans l'appli (sans l'heure dessous).
   - Le formulaire poste sur /api/demo-request (nom, e-mail, telephone). */

import QRCode from "qrcode";

const calme = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- En-tete : un filet des qu'on defile ---------- */
const entete = document.querySelector(".entete");
const suivreDefilement = () => entete.classList.toggle("defile", window.scrollY > 8);
window.addEventListener("scroll", suivreDefilement, { passive: true });
suivreDefilement();

/* ---------- La carte du client qui se remplit ---------- */
const pass = document.getElementById("pass");
const lignes = [...document.querySelectorAll("#pass-historique li")];
const solde = document.getElementById("pass-solde");
const jauge = document.getElementById("pass-jauge");
const objectif = document.getElementById("pass-objectif");
const reste = document.getElementById("pass-reste");
const OBJECTIF = 180;

function afficher(valeur) {
  solde.textContent = String(valeur);
  jauge.style.width = Math.min(100, (valeur / OBJECTIF) * 100) + "%";
  if (valeur >= OBJECTIF) {
    pass.classList.add("pleine");
    objectif.textContent = "Cappuccino offert : à montrer au comptoir";
  } else {
    reste.textContent = String(OBJECTIF - valeur);
  }
}

function compter(de, a, duree) {
  const debut = performance.now();
  return new Promise((fin) => {
    const pas = (t) => {
      const k = Math.min(1, (t - debut) / duree);
      afficher(Math.round(de + (a - de) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(pas);
      else fin();
    };
    requestAnimationFrame(pas);
  });
}

(async function remplir() {
  if (calme) {
    lignes.forEach((l) => l.classList.add("vu"));
    return afficher(OBJECTIF);
  }
  let total = 0;
  await attendre(600);
  for (const ligne of lignes) {
    const pts = Number(ligne.dataset.pts);
    ligne.classList.add("vu");
    await compter(total, total + pts, pts > 20 ? 800 : 300);
    total += pts;
    await attendre(pts > 20 ? 0 : 250);
  }
})();

/* ---------- Le bandeau : texte double pour une boucle sans a-coup ---------- */
const piste = document.querySelector(".bandeau-piste");
if (piste) {
  const copie = piste.firstElementChild.cloneNode(true);
  copie.setAttribute("aria-hidden", "true");
  piste.appendChild(copie);
}

/* ---------- Le vrai QR code du bon ---------- */
const qrBon = document.getElementById("qr-bon");
let fenetre = -1;
async function majQr() {
  const f = Math.floor(Date.now() / 30000);
  if (f === fenetre) return;
  fenetre = f;
  qrBon.innerHTML = await QRCode.toString("NOCTIFY-EXEMPLE-BON-" + f, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#141414", light: "#ffffff" },
  });
}
majQr();
setInterval(majQr, 2000);

/* ---------- Combien vous coute votre pub ----------
   Le commercant regle ce qu'il depense deja en pub et ses clients par jour.
   Garde par an = (pub d'aujourd'hui - Noctify Premium 49,99 €) x 12.
   Stories : si un client sur vingt poste une story dans le mois (ecrit sous
   le calcul) -> clients par jour x 30 / 20. */
const reglageBudget = document.getElementById("est-budget");
const reglageClients = document.getElementById("est-clients");
if (reglageBudget && reglageClients) {
  const PREMIUM = 49.99;
  const fmt = (n) => Math.round(n).toLocaleString("fr-BE");
  const el = (id) => document.getElementById(id);
  let affiche = 0;
  let anim = 0;
  const remplir = (c) => c.style.setProperty("--rempli", ((c.value - c.min) / (c.max - c.min)) * 100 + "%");
  function animer(cible) {
    cancelAnimationFrame(anim);
    const depart = affiche;
    const debut = performance.now();
    const pas = (t) => {
      const k = calme ? 1 : Math.min(1, (t - debut) / 400);
      affiche = depart + (cible - depart) * (1 - Math.pow(1 - k, 3));
      el("est-garde").textContent = fmt(affiche);
      if (k < 1) anim = requestAnimationFrame(pas);
    };
    anim = requestAnimationFrame(pas);
  }
  function calculer() {
    const budget = Number(reglageBudget.value);
    const clients = Number(reglageClients.value);
    el("est-budget-val").textContent = fmt(budget) + " €";
    el("est-clients-val").textContent = String(clients);
    el("est-pub").textContent = fmt(budget);
    el("est-stories").textContent = fmt(Math.max(1, (clients * 30) / 20));
    animer(Math.max(0, (budget - PREMIUM) * 12));
    const echelle = Math.max(budget, PREMIUM);
    el("est-barre-pub").style.width = (budget / echelle) * 100 + "%";
    el("est-barre-noct").style.width = Math.max(2, (PREMIUM / echelle) * 100) + "%";
    remplir(reglageBudget);
    remplir(reglageClients);
  }
  reglageBudget.addEventListener("input", calculer);
  reglageClients.addEventListener("input", calculer);
  calculer();
}

/* ---------- Le formulaire ---------- */
const formulaire = document.getElementById("formulaire");
const bouton = document.getElementById("envoyer");
const erreur = document.getElementById("erreur");

function verifier(champ) {
  const ok = champ.checkValidity() && champ.value.trim() !== "";
  champ.setAttribute("aria-invalid", ok ? "false" : "true");
  return ok;
}

formulaire.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  erreur.textContent = "";
  const { club, email, phone } = formulaire.elements;
  const champs = [club, email, phone];
  const valides = champs.map(verifier);
  if (valides.includes(false)) {
    erreur.textContent =
      !valides[1] && email.value.trim()
        ? "Cette adresse e-mail ne semble pas complète."
        : "Remplissez le nom du commerce, l'e-mail et le téléphone.";
    champs[valides.indexOf(false)].focus();
    return;
  }

  bouton.disabled = true;
  bouton.textContent = "Envoi…";
  try {
    const reponse = await fetch("/api/demo-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ club: club.value.trim(), email: email.value.trim(), phone: phone.value.trim() }),
    });
    const corps = await reponse.json().catch(() => ({}));
    if (!reponse.ok) throw new Error(corps.message || corps.error || "");
    formulaire.querySelector(".champs").hidden = true;
    formulaire.querySelector(".merci").hidden = false;
  } catch (e) {
    erreur.textContent =
      (e && e.message) || "L'envoi n'a pas marché. Réessayez, ou écrivez-nous à noctify.support@gmail.com.";
    bouton.disabled = false;
    bouton.textContent = "Être rappelé";
  }
});
