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

  // Petit generateur pseudo-aleatoire determineiste (une seule seed
  // par boule).
  function rand(seed) {
    let x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  // Boules de lumiere, limitees au hero (contrairement a l'essai en
  // page entiere qui a ete abandonne). Rayon de deplacement large :
  // chaque boule parcourt vraiment toute la hero (x et y couvrent
  // chacun bien au-dela de 0-1 sur leur cycle), pas juste une zone.
  const ORB_COUNT = 20;
  const ORB_RADIUS = 0.06;
  const orbs = Array.from({ length: ORB_COUNT }, (_, i) => ({
    x: rand(i * 3.1 + 1),
    y: rand(i * 7.7 + 2),
    r: ORB_RADIUS,
    ax: 0.45 + rand(i * 5.3 + 3) * 0.35,
    ay: 0.4 + rand(i * 9.1 + 4) * 0.35,
    speed: 0.00014 + rand(i * 4.4 + 5) * 0.00022,
    phase: rand(i * 6.6 + 6) * Math.PI * 2,
    tint: i % 3 === 0 ? IRIS : i % 5 === 0 ? MIST : CORAL,
  }));

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

  // Plutot que d'esperer qu'une trajectoire evite le texte, on eteint
  // directement tout ce qui passe dans la zone ou vit le texte (colonne
  // centrale, du haut jusqu'aux CTA) - quelle que soit sa trajectoire,
  // ca ne peut plus gener la lecture. Fondu doux sur les bords, pas de
  // coupure nette.
  const TEXT_ZONE = { left: 0.12, right: 0.88, top: 0.0, bottom: 0.66, margin: 0.06 };

  // Le fondu ne regardait que le CENTRE de la boule. Avec un rayon
  // (ORB_RADIUS = 0.06) plus grand que la marge de transition, une
  // boule dont le centre est juste hors zone gardait son coeur plein
  // visible alors que son contour debordait deja dans le texte.
  // Le rayon de la boule est retranche de la distance : le fondu
  // commence des que le BORD de la boule touche la zone, pas son centre.
  function textZoneFade(cx, cy, radiusNorm) {
    const nx = cx / width;
    const ny = cy / height;
    const outsideDist =
      Math.max(TEXT_ZONE.left - nx, nx - TEXT_ZONE.right, TEXT_ZONE.top - ny, ny - TEXT_ZONE.bottom) - radiusNorm;
    const margin = TEXT_ZONE.margin + radiusNorm;
    if (outsideDist >= margin) return 1;
    if (outsideDist <= 0) return 0;
    return outsideDist / margin;
  }

  function drawOrb(t, orb, boost = 1) {
    const cx = (orb.x + Math.cos(t * orb.speed + orb.phase) * orb.ax) * width;
    const cy = (orb.y + Math.sin(t * orb.speed * 1.4 + orb.phase) * orb.ay) * height;
    const r = orb.r * Math.max(width, height);
    const fade = textZoneFade(cx, cy, orb.r);
    // Intensite fixe (plus de pulse individuel) : une boule au creux
    // de son cycle de luminosite devenait trop faible pour rester
    // visible, ce qui la faisait paraitre plus petite que les autres.
    const pulse = 0.34;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(${orb.tint}, ${pulse * boost * fade})`);
    g.addColorStop(0.35, `rgba(${orb.tint}, ${pulse * boost * fade})`);
    g.addColorStop(0.7, `rgba(${orb.tint}, ${pulse * 0.18 * boost * fade})`);
    g.addColorStop(1, `rgba(${orb.tint}, 0)`);
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
    orbs.forEach((orb) => drawOrb(tm, orb, pulse));
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
