/* ============================================================
   VIRALNIGHT — Runtime du design system
   ------------------------------------------------------------
   Le petit JS dont theme.css a besoin, et rien de plus :
   - [data-reveal] / [data-reveal-group] : apparition au scroll
   - .spot : spotlight qui suit la souris

   Sans dependance, sans build. A charger en <script type="module">
   ou en <script defer>. Chaque page peut le charger, il ne
   s'initialise qu'une fois.

   Regle de securite : l'etat cache des [data-reveal] est scope
   dans theme.css sous .vn-reveal-ready, classe posee ici et
   seulement ici. Si ce fichier ne s'execute pas (erreur reseau,
   navigateur ancien, JS desactive), la classe n'est jamais
   posee et tout le contenu reste visible. Ne jamais mettre
   .vn-reveal-ready en dur dans le HTML.
   ============================================================ */

const REVEAL_SELECTOR = "[data-reveal], [data-reveal-group]";
const READY_CLASS = "vn-reveal-ready";

let initialised = false;

/**
 * Rend visible tout ce qui devait apparaitre au scroll.
 * Utilise comme fallback quand IntersectionObserver manque ou
 * quand l'utilisateur a demande moins d'animations.
 */
function revealEverything(root = document) {
  root.querySelectorAll(REVEAL_SELECTOR).forEach((el) => el.classList.add("in"));
}

/**
 * Numerote les enfants d'un [data-reveal-group] pour que le CSS
 * puisse decaler leur apparition via --i.
 */
function indexGroups(root = document) {
  root.querySelectorAll("[data-reveal-group]").forEach((group) => {
    Array.from(group.children).forEach((child, i) => {
      child.style.setProperty("--i", String(i));
    });
  });
}

function setupReveals(root = document) {
  indexGroups(root);

  if (!("IntersectionObserver" in window)) {
    // Pas d'observer : on n'arme pas l'etat cache du tout.
    document.documentElement.classList.remove(READY_CLASS);
    revealEverything(root);
    return;
  }

  // A partir d'ici seulement, le CSS a le droit de cacher.
  document.documentElement.classList.add(READY_CLASS);

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        // Une fois apparu, on ne l'observe plus : pas de re-jeu au
        // scroll inverse, ca donne un effet nerveux desagreable.
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.12 }
  );

  root.querySelectorAll(REVEAL_SELECTOR).forEach((el) => observer.observe(el));
}

/**
 * Spotlight : on ecrit la position de la souris dans --mx / --my,
 * le pseudo-element ::before de .spot fait le reste.
 * Delegation sur document : marche aussi pour les .spot ajoutes
 * dynamiquement (cartes rendues depuis Supabase, par exemple).
 */
function setupSpotlight() {
  document.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType === "touch") return;
      const card = event.target instanceof Element ? event.target.closest(".spot") : null;
      if (!card) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      card.style.setProperty("--my", `${event.clientY - rect.top}px`);
    },
    { passive: true }
  );
}

export function initTheme() {
  if (initialised) return;
  initialised = true;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduced) {
    indexGroups();
    revealEverything();
  } else {
    setupReveals();
    setupSpotlight();
  }
}

/**
 * A appeler apres avoir injecte du HTML (rendu d'une liste
 * Supabase, changement d'onglet du dashboard...) pour que les
 * nouveaux [data-reveal] soient pris en compte.
 */
export function refreshTheme(root = document) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    indexGroups(root);
    revealEverything(root);
    return;
  }
  setupReveals(root);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTheme, { once: true });
} else {
  initTheme();
}
