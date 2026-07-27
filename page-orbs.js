/* ============================================================
   VIRALNIGHT — Boules de lumiere en fond, sur toute la page
   ------------------------------------------------------------
   Contrairement a club-scene.js (limite au hero), ce canvas est en
   position:fixed sur tout le viewport : les boules restent visibles
   pendant le scroll, sur toutes les sections. Purement decoratif,
   aria-hidden dans le HTML.

   Reste volontairement discret (nombre, opacite) : cette couche a
   deja cause plusieurs regressions de lisibilite dans le hero avant
   d'etre stabilisee - mieux vaut repartir sobre ici.
   ============================================================ */

const canvas = document.getElementById("pageOrbsCanvas");

if (canvas && canvas.getContext) {
  const ctx = canvas.getContext("2d");
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let width = 0;
  let height = 0;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const MIST = "230, 230, 230";
  const CORAL = "255, 99, 99";
  const IRIS = "146, 129, 247";

  function rand(seed) {
    let x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  const ORB_COUNT = 10;
  const ORB_RADIUS = 0.05;
  const orbs = Array.from({ length: ORB_COUNT }, (_, i) => ({
    x: rand(i * 3.1 + 1),
    y: rand(i * 7.7 + 2),
    r: ORB_RADIUS,
    ax: 0.3 + rand(i * 5.3 + 3) * 0.25,
    ay: 0.3 + rand(i * 9.1 + 4) * 0.25,
    speed: 0.00011 + rand(i * 4.4 + 5) * 0.00015,
    phase: rand(i * 6.6 + 6) * Math.PI * 2,
    tint: i % 3 === 0 ? IRIS : i % 5 === 0 ? MIST : CORAL,
  }));

  function drawOrb(t, orb) {
    const cx = (orb.x + Math.cos(t * orb.speed + orb.phase) * orb.ax) * width;
    const cy = (orb.y + Math.sin(t * orb.speed * 1.4 + orb.phase) * orb.ay) * height;
    const r = orb.r * Math.max(width, height);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(${orb.tint}, 0.16)`);
    g.addColorStop(0.4, `rgba(${orb.tint}, 0.16)`);
    g.addColorStop(1, `rgba(${orb.tint}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  let sceneStart = null;

  function renderFrame(t) {
    if (sceneStart === null) sceneStart = t;
    const elapsed = t - sceneStart;
    const ignite = Math.min(1, elapsed / 1400);
    const eased = 1 - Math.pow(1 - ignite, 3);
    const tm = REDUCED ? sceneStart + (t - sceneStart) * 0.12 : t;

    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";
    orbs.forEach((orb) => {
      ctx.globalAlpha = eased;
      drawOrb(tm, orb);
    });
    ctx.globalAlpha = 1;
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
  start();

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
