/* ============================================================
   VIRALNIGHT — Scene de club animee du hero
   ------------------------------------------------------------
   Canvas 2D : silhouettes qui dansent au sol, spots qui balaient
   au-dessus, le tout en traînées de lumière (light-painting) plutot
   qu'en formes figees. Purement decoratif, aria-hidden dans le HTML.

   Degradation :
   - Pas de <canvas> supporte, pas de contexte 2D -> on ne fait rien,
     le fond reste le voile sombre de .club-scene-overlay.
   - prefers-reduced-motion -> une seule image fixe, pas de boucle.
   - Onglet cache ou hero hors ecran -> boucle en pause (CPU/energie).
   ============================================================ */

const canvas = document.getElementById("clubCanvas");

if (canvas && canvas.getContext) {
  const ctx = canvas.getContext("2d");
  const hero = canvas.closest(".hero");
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let width = 0;
  let height = 0;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    const rect = hero.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Couleurs de l'atmosphere du hero uniquement (theme.css) : bone/mist
  // pour la lumiere neutre, un filet de corail et de violet en accent -
  // jamais sur un CTA ou du texte, ce n'est que le halo de la scene.
  const MIST = "230, 230, 230";
  const CORAL = "255, 99, 99";
  const IRIS = "146, 129, 247";

  // Pas de lumiere "cle" fixe en haut : tout doit bouger. Deux
  // accents larges qui derivent lentement (corail, iris), et les
  // boules ci-dessous comme couche de taille moyenne, toutes a la
  // meme taille pour ne pas retomber sur "deux enormes + le reste".
  const SPOTLIGHTS = [
    { color: CORAL, r: 0.075, ax: 0.3, ay: 0.12, px: 0.3, py: 0.1, speed: 0.00021, phase: 0 },
    { color: IRIS, r: 0.065, ax: 0.24, ay: 0.1, px: 0.68, py: 0.07, speed: 0.00017, phase: 2.1 },
  ];

  // Boules de lumiere retirees : elles finissaient toujours par
  // passer devant le texte quelle que soit la position/taille/vitesse
  // essayee. La scene se limite maintenant aux deux spots d'ambiance
  // et a la foule qui danse au sol.

  // Le hero est nettement plus haut que la plupart des ecrans (le
  // contenu texte ne suffit pas a remplir toute la section) : un sol
  // a 90% de la hauteur du hero tombait bien sous le pli, invisible
  // sans scroller. Remonte dans la zone qu'on voit vraiment au
  // chargement.
  const DANCER_COUNT = 16;
  const dancers = Array.from({ length: DANCER_COUNT }, (_, i) => {
    const tint = i % 3 === 0 ? IRIS : i % 2 === 0 ? CORAL : MIST;
    return {
      x: (i + 0.5) / DANCER_COUNT,
      floor: 0.64 + (i % 3) * 0.02,
      height: 0.14 + ((i * 37) % 10) / 110,
      sway: 0.008 + ((i * 13) % 6) / 1000,
      bobSpeed: 0.0016 + ((i * 29) % 7) / 10000,
      phase: (i * 0.63) % (Math.PI * 2),
      tint,
    };
  });

  function drawSpotlight(t, spot, boost = 1) {
    const cx = (spot.px + Math.cos(t * spot.speed + spot.phase) * spot.ax) * width;
    const cy = (spot.py + Math.sin(t * spot.speed * 1.3 + spot.phase) * spot.ay) * height;
    const r = spot.r * Math.max(width, height);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(${spot.color}, ${0.26 * boost})`);
    g.addColorStop(1, `rgba(${spot.color}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  function drawDancer(t, d) {
    const x = d.x * width + Math.sin(t * d.bobSpeed * 1.7 + d.phase) * d.sway * width;
    const floorY = d.floor * height;
    const bob = Math.abs(Math.sin(t * d.bobSpeed + d.phase)) * height * 0.05;
    const h = d.height * height;
    const topY = floorY - h - bob;
    const w = h * 0.34;
    // Leger balancement plutot qu'un aller-retour purement vertical :
    // ca lit davantage comme une danse que comme un rebond mecanique.
    const lean = Math.sin(t * d.bobSpeed * 1.7 + d.phase) * 0.14;

    const g = ctx.createLinearGradient(x, floorY, x, topY);
    g.addColorStop(0, `rgba(${d.tint}, 0.38)`);
    g.addColorStop(0.55, `rgba(${d.tint}, 0.16)`);
    g.addColorStop(1, `rgba(${d.tint}, 0)`);
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(x, floorY);
    ctx.rotate(lean);
    ctx.beginPath();
    ctx.ellipse(0, -(floorY - topY) / 2, w, (floorY - topY) / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tete : petit point plus dense en haut du halo.
    ctx.fillStyle = `rgba(${d.tint}, 0.45)`;
    ctx.beginPath();
    ctx.arc(0, -(h - h * 0.08) - bob, w * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Allumage a l'arrivee sur la page : la scene monte de noir a
  // pleine intensite en ~1.4s au lieu d'apparaitre d'un coup, comme
  // les lumieres d'un club qui s'allument.
  let sceneStart = null;

  // Parallax souris, discret : seules les lumieres du ciel (spots +
  // boules) suivent le curseur, la foule reste au sol. Interpolation
  // douce, pas de saut si la souris bouge vite.
  const CAN_HOVER = window.matchMedia("(hover: hover)").matches;
  let pointerX = 0.5;
  let pointerY = 0.5;
  let smoothX = 0.5;
  let smoothY = 0.5;
  const PARALLAX = 0.045;

  if (CAN_HOVER) {
    hero.addEventListener("pointermove", (e) => {
      const rect = hero.getBoundingClientRect();
      pointerX = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      pointerY = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    });
    hero.addEventListener("pointerleave", () => {
      pointerX = 0.5;
      pointerY = 0.5;
    });
  }

  // Reduced motion : le mouvement est ralenti, pas arrete. Une image
  // figee ne laisse jamais le temps a l'effet de trainee (le voile
  // presque opaque redessine chaque frame) de s'accumuler - le
  // resultat reste presque entierement noir, ce qui est exactement
  // le bug remonte ("je ne vois pas de boules"). La boucle continue
  // de tourner, juste tres lentement.
  const MOTION_SCALE = REDUCED ? 0.12 : 1;

  function renderFrame(t) {
    if (sceneStart === null) sceneStart = t;
    const elapsed = t - sceneStart;
    const ignite = Math.min(1, elapsed / 1400);
    const eased = 1 - Math.pow(1 - ignite, 3);
    const tm = sceneStart + (t - sceneStart) * MOTION_SCALE;

    // Voile quasi-opaque plutot qu'un clear total : les traces de la
    // frame precedente s'estompent au lieu de disparaitre net, ce qui
    // cree l'effet de lumiere qui "traine" derriere le mouvement.
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(4, 5, 6, 0.26)";
    ctx.fillRect(0, 0, width, height);

    // Pulse partage, lent : toute la scene respire ensemble au lieu
    // que chaque element bouge independamment, comme calee sur un kick.
    const pulse = (0.85 + 0.15 * Math.abs(Math.sin(tm * 0.0012))) * eased;

    smoothX += (pointerX - smoothX) * 0.05;
    smoothY += (pointerY - smoothY) * 0.05;

    ctx.globalCompositeOperation = "lighter";
    ctx.save();
    ctx.translate((smoothX - 0.5) * PARALLAX * width, (smoothY - 0.5) * PARALLAX * height);
    SPOTLIGHTS.forEach((spot) => drawSpotlight(tm, spot, pulse));
    ctx.restore();
    dancers.forEach((d) => drawDancer(tm, d));
  }

  let rafId = null;
  let running = false;

  function loop(t) {
    renderFrame(t);
    rafId = running ? requestAnimationFrame(loop) : null;
  }

  function start() {
    if (running) return;
    running = true;
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  resize();

  // Boucle active dans tous les cas (juste tres lente si REDUCED) :
  // suspendue seulement quand la scene n'est pas a l'ecran ou que
  // l'onglet est cache.
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !document.hidden) start();
        else stop();
      },
      { threshold: 0.01 },
    );
    io.observe(hero);
  } else {
    start();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else if (!running) start();
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });
}
