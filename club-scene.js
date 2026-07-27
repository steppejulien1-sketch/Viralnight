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

  const SPOTLIGHTS = [
    { color: CORAL, r: 0.16, ax: 0.28, ay: 0.1, px: 0.32, py: 0.1, speed: 0.00021, phase: 0 },
    { color: IRIS, r: 0.13, ax: 0.22, ay: 0.08, px: 0.62, py: 0.06, speed: 0.00017, phase: 2.1 },
    { color: MIST, r: 0.1, ax: 0.18, ay: 0.06, px: 0.5, py: 0.14, speed: 0.00026, phase: 4.4 },
  ];

  const DANCER_COUNT = 16;
  const dancers = Array.from({ length: DANCER_COUNT }, (_, i) => {
    const tint = i % 5 === 0 ? CORAL : i % 7 === 0 ? IRIS : MIST;
    return {
      x: (i + 0.5) / DANCER_COUNT,
      floor: 0.9 + (i % 3) * 0.02,
      height: 0.16 + ((i * 37) % 10) / 100,
      sway: 0.008 + ((i * 13) % 6) / 1000,
      bobSpeed: 0.0016 + ((i * 29) % 7) / 10000,
      phase: (i * 0.63) % (Math.PI * 2),
      tint,
    };
  });

  function drawSpotlight(t, spot) {
    const cx = (spot.px + Math.cos(t * spot.speed + spot.phase) * spot.ax) * width;
    const cy = (spot.py + Math.sin(t * spot.speed * 1.3 + spot.phase) * spot.ay) * height;
    const r = spot.r * Math.max(width, height);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(${spot.color}, 0.5)`);
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

    const g = ctx.createLinearGradient(x, floorY, x, topY);
    g.addColorStop(0, `rgba(${d.tint}, 0.38)`);
    g.addColorStop(0.55, `rgba(${d.tint}, 0.16)`);
    g.addColorStop(1, `rgba(${d.tint}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, (floorY + topY) / 2, w, (floorY - topY) / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tete : petit point plus dense en haut du halo.
    ctx.fillStyle = `rgba(${d.tint}, 0.45)`;
    ctx.beginPath();
    ctx.arc(x, topY + h * 0.08, w * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }

  function renderFrame(t) {
    // Voile quasi-opaque plutot qu'un clear total : les traces de la
    // frame precedente s'estompent au lieu de disparaitre net, ce qui
    // cree l'effet de lumiere qui "traine" derriere le mouvement.
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(4, 5, 6, 0.16)";
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = "lighter";
    SPOTLIGHTS.forEach((spot) => drawSpotlight(t, spot));
    dancers.forEach((d) => drawDancer(t, d));
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

  if (REDUCED) {
    // Une seule image, posee, pas de boucle qui tourne en continu.
    renderFrame(0);
  } else {
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
}
