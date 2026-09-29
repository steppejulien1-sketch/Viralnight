/* Site public Noctify pour les commerces (29/09/2026).

   - La carte du premier ecran se tamponne une fois au chargement : quatre
     passages (+20), puis la story (+100) qui debloque la recompense.
     Sans animation (prefers-reduced-motion), elle s'affiche deja remplie.
   - Le bon d'exemple change de QR toutes les 30 s et son heure defile,
     comme dans l'appli : c'est ce qui empeche une capture d'ecran de passer.
   - Le formulaire poste sur /api/demo-request (meme route que l'ancienne
     page ; l'offre choisie est ajoutee au nom du commerce, pour que le
     rappel sache de quoi parler sans toucher a la table). */

const calme = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- En-tete : un filet des qu'on defile ---------- */
const entete = document.querySelector(".entete");
const suivreDefilement = () => entete.classList.toggle("defile", window.scrollY > 8);
window.addEventListener("scroll", suivreDefilement, { passive: true });
suivreDefilement();

/* ---------- La carte qui se tamponne ---------- */
const carte = document.getElementById("carte-demo");
const tampons = [...carte.querySelectorAll(".tampon")];
const solde = document.getElementById("solde");
const jauge = document.getElementById("jauge");
const OBJECTIF = 180;

function afficherSolde(valeur) {
  solde.textContent = String(valeur);
  jauge.style.width = Math.min(100, (valeur / OBJECTIF) * 100) + "%";
}

function compter(de, a, duree) {
  if (calme) return afficherSolde(a);
  const debut = performance.now();
  return new Promise((fin) => {
    const pas = (t) => {
      const k = Math.min(1, (t - debut) / duree);
      const e = 1 - Math.pow(1 - k, 3);
      afficherSolde(Math.round(de + (a - de) * e));
      if (k < 1) requestAnimationFrame(pas);
      else fin();
    };
    requestAnimationFrame(pas);
  });
}

async function tamponner() {
  let total = 0;
  if (calme) {
    tampons.forEach((t) => t.classList.add("pose"));
    total = tampons.reduce((s, t) => s + Number(t.dataset.pts), 0);
    afficherSolde(total);
    carte.classList.add("pleine");
    return;
  }
  await attendre(500);
  for (const t of tampons) {
    const avant = total;
    total += Number(t.dataset.pts);
    const story = t.classList.contains("tampon-story");
    if (story) await attendre(450);
    t.classList.add("pose");
    await compter(avant, total, story ? 700 : 260);
    await attendre(story ? 0 : 160);
  }
  carte.classList.add("pleine");
}
tamponner();

/* ---------- Des QR d'exemple (motif, pas un vrai code) ---------- */
function motifQr(conteneur, graine) {
  const n = 21;
  let x = graine >>> 0 || 1;
  const hasard = () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
  const repere = (r, c) => {
    for (const [or, oc] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
      const i = r - or;
      const j = c - oc;
      if (i >= -1 && i <= 7 && j >= -1 && j <= 7) {
        if (i < 0 || j < 0 || i > 6 || j > 6) return 0;
        const bord = i === 0 || j === 0 || i === 6 || j === 6;
        const centre = i >= 2 && i <= 4 && j >= 2 && j <= 4;
        return bord || centre ? 1 : 0;
      }
    }
    return null;
  };
  const cases = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const fixe = repere(r, c);
      const plein = fixe === null ? hasard() > 0.52 : fixe === 1;
      cases.push(plein ? "<i></i>" : "<b></b>");
    }
  }
  conteneur.innerHTML = cases.join("");
}

motifQr(document.getElementById("qr-affiche"), 20260929);

const qrBon = document.getElementById("qr-bon");
const heureBon = document.getElementById("bon-heure");
let fenetre = -1;
function tictac() {
  const maintenant = new Date();
  heureBon.textContent = maintenant.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const f = Math.floor(maintenant.getTime() / 30000);
  if (f !== fenetre) {
    fenetre = f;
    motifQr(qrBon, f);
  }
}
tictac();
setInterval(tictac, 1000);

/* ---------- Les offres pre-remplissent le formulaire ---------- */
const choixOffre = document.getElementById("choix-offre");
document.querySelectorAll("[data-offre]").forEach((lien) => {
  lien.addEventListener("click", () => {
    choixOffre.value = lien.dataset.offre;
  });
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
  const { club, email, phone, offre } = formulaire.elements;
  const valides = [club, email, phone].map(verifier);
  if (valides.includes(false)) {
    erreur.textContent = !valides[1] && email.value.trim()
      ? "Cette adresse e-mail ne semble pas complète."
      : "Remplissez le nom du commerce, l'e-mail et le téléphone.";
    [club, email, phone][valides.indexOf(false)].focus();
    return;
  }

  bouton.disabled = true;
  bouton.textContent = "Envoi…";
  try {
    const nom = club.value.trim() + (offre.value ? " — offre " + offre.value : "");
    const reponse = await fetch("/api/demo-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ club: nom, email: email.value.trim(), phone: phone.value.trim() }),
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
