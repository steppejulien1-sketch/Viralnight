/* Site public Noctify pour les commerces (29/09/2026, v3).

   - La carte du premier ecran se remplit une fois : quatre passages (+20),
     puis la story (+100) qui debloque le cappuccino.
   - Le bandeau des commerces defile : le texte est double ici pour que la
     boucle ne se voie pas.
   - Le bon d'exemple porte un vrai QR code, qui change toutes les 30 s
     comme dans l'appli (sans l'heure dessous : Julien ne la voulait pas).
   - « Essayez » : le visiteur ajoute une recompense et la voit apparaitre
     dans la boutique du telephone. Rien n'est enregistre.
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
const lignes = [...pass.querySelectorAll(".pass-historique li")];
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

/* ---------- Essayez : ajouter une recompense ---------- */
const liste = document.getElementById("liste-recompenses");
const apercu = document.getElementById("apercu-recompenses");
const ajout = document.getElementById("ajout-recompense");
const note = document.getElementById("editeur-note");
const SOLDE_DEMO = 240;
const MAX = 6;

const recompenses = [...liste.querySelectorAll("li")].map((li) => ({
  nom: li.querySelector("span").textContent,
  points: parseInt(li.querySelector("b").textContent.replace(/\s/g, ""), 10),
}));

const format = (n) => n.toLocaleString("fr-BE");

function tuile(r, nouveau) {
  const li = document.createElement("li");
  if (nouveau) li.className = "nouveau";
  const nom = document.createElement("span");
  nom.textContent = r.nom;
  const pts = document.createElement("b");
  pts.textContent = format(r.points) + " pts";
  li.append(nom, pts);
  if (r.points <= SOLDE_DEMO) {
    const dispo = document.createElement("em");
    dispo.textContent = "Disponible";
    li.append(dispo);
  }
  return li;
}

function rendreApercu(dernier) {
  apercu.replaceChildren(...recompenses.map((r, i) => tuile(r, i === dernier)));
}
rendreApercu(-1);

ajout.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const nom = ajout.elements.nom.value.trim();
  const points = Number(ajout.elements.points.value);
  if (!nom) {
    ajout.elements.nom.focus();
    return;
  }
  if (recompenses.length >= MAX) {
    note.textContent = "Ça suffit pour la démonstration. Dans l'appli, vous en mettez autant que vous voulez.";
    return;
  }
  recompenses.push({ nom, points });
  const li = document.createElement("li");
  li.className = "nouveau";
  const s = document.createElement("span");
  s.textContent = nom;
  const b = document.createElement("b");
  b.textContent = format(points) + " pts";
  li.append(s, b);
  liste.appendChild(li);
  rendreApercu(recompenses.length - 1);
  ajout.reset();
  note.textContent = "Ajoutée. Regardez le téléphone : vos clients la voient tout de suite.";
});

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
