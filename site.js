/* Site public Noctify pour les commerces (30/09/2026, v5).

   - La carte noire du premier ecran se tamponne une fois : quatre passages
     (+20), puis la story (+100) qui debloque le cappuccino.
   - Le bandeau des commerces defile : le texte est double ici pour que la
     boucle ne se voie pas.
   - Le bon de l'etape 3 porte un vrai QR code, qui change toutes les 30 s
     comme dans l'appli (sans l'heure dessous).
   - Le formulaire poste sur /api/demo-request (nom, e-mail, telephone). */

const calme = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- En-tete : un filet des qu'on defile ---------- */
const entete = document.querySelector(".entete");
const suivreDefilement = () => entete.classList.toggle("defile", window.scrollY > 8);
window.addEventListener("scroll", suivreDefilement, { passive: true });
suivreDefilement();

/* ---------- La carte membre ----------
   Les tampons se posent un par un (trois passages, puis une story) et le
   solde monte avec eux ; la ligne du bas dit d'ou viennent les points. Les
   points sont communs a tous les commerces. La carte s'incline sous la
   souris. */
const membre = document.getElementById("membre");
const soldeMembre = document.getElementById("membre-solde");
const tamponsMembre = [...document.querySelectorAll("#membre-tampons li[data-pts]")];
const dernier = document.getElementById("membre-dernier");
const ORIGINES = ["Café des Étangs", "Maison Lemaire", "Barber de la Place", "Story Instagram"];

function compter(de, a, duree) {
  const debut = performance.now();
  return new Promise((fin) => {
    const pas = (t) => {
      const k = calme ? 1 : Math.min(1, (t - debut) / duree);
      soldeMembre.textContent = String(Math.round(de + (a - de) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(pas);
      else fin();
    };
    requestAnimationFrame(pas);
  });
}

(async function remplir() {
  let total = 180;
  if (calme) {
    tamponsMembre.forEach((t) => t.classList.add("pose"));
    soldeMembre.textContent = "340";
    return;
  }
  await attendre(800);
  for (const [i, t] of tamponsMembre.entries()) {
    const pts = Number(t.dataset.pts);
    t.classList.add("pose");
    dernier.textContent = "+" + pts + " · " + ORIGINES[i];
    await compter(total, total + pts, pts > 20 ? 900 : 400);
    total += pts;
    await attendre(pts > 20 ? 900 : 450);
  }
  dernier.textContent = "Valables dans tous les commerces Noctify";
})();

if (membre && !calme && window.matchMedia("(hover: hover)").matches) {
  const scene = membre.parentElement;
  scene.addEventListener("pointermove", (e) => {
    const r = membre.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    membre.style.setProperty("--rx", (-y * 10).toFixed(2) + "deg");
    membre.style.setProperty("--ry", (x * 14).toFixed(2) + "deg");
    membre.style.setProperty("--lx", ((x + 0.5) * 100).toFixed(1) + "%");
  });
  scene.addEventListener("pointerleave", () => {
    membre.style.setProperty("--rx", "0deg");
    membre.style.setProperty("--ry", "0deg");
    membre.style.setProperty("--lx", "30%");
  });
}

/* ---------- Le bandeau : texte double pour une boucle sans a-coup ---------- */
const piste = document.querySelector(".bandeau-piste");
if (piste) {
  const copie = piste.firstElementChild.cloneNode(true);
  copie.setAttribute("aria-hidden", "true");
  piste.appendChild(copie);
}

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

/* ---------- Etape 3 : boutique -> recompense -> bon ----------
   Le telephone rejoue le parcours du client (comme chez Joyn) : la
   boutique, un toucher sur une recompense, la fiche, un toucher sur
   « Echanger », puis le bon a montrer au comptoir. En boucle, seulement
   quand la section est a l'ecran. */
const telParcours = document.getElementById("tel-parcours");
if (telParcours) {
  const ecrans = [...telParcours.querySelectorAll(".ecran")];
  const pastilles = [...document.querySelectorAll(".parcours-etapes li")];
  const doigt = telParcours.querySelector(".doigt");
  // Ou le doigt touche, en % de l'ecran : la carte « Cappuccino », puis « Echanger ».
  const touches = [{ x: 72, y: 30 }, { x: 50, y: 89 }, null];
  let i = 0;
  let minuteur = null;
  const montrer = (n) => {
    ecrans.forEach((e, k) => e.classList.toggle("actif", k === n));
    pastilles.forEach((e, k) => e.classList.toggle("actif", k === n));
  };
  const suivant = () => {
    const t = touches[i];
    if (t && !calme) {
      doigt.style.left = t.x + "%";
      doigt.style.top = t.y + "%";
      doigt.classList.remove("tape");
      void doigt.offsetWidth;
      doigt.classList.add("tape");
    }
    setTimeout(() => {
      doigt.classList.remove("tape");
      i = (i + 1) % ecrans.length;
      montrer(i);
    }, t ? 700 : 0);
  };
  montrer(0);
  if (!calme && "IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => {
      clearInterval(minuteur);
      if (e.isIntersecting) minuteur = setInterval(suivant, 2600);
    }, { threshold: 0.4 }).observe(telParcours);
  }
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

/* Tarifs : annuel (-15 %) par defaut, mensuel au choix (04/10/2026). */
document.querySelectorAll("[data-periode]").forEach((bouton) => {
  bouton.addEventListener("click", () => {
    const periode = bouton.dataset.periode;
    document.querySelectorAll("[data-periode]").forEach((b) => {
      const on = b === bouton;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", String(on));
    });
    document.querySelectorAll("#offres [data-annuel]").forEach((el) => {
      el.textContent = el.dataset[periode];
    });
  });
});
