/* ============================================================
   VIRALNIGHT — Landing publique
   ------------------------------------------------------------
   JS specifique a index.html.

   Ce qui n'est PAS ici, volontairement :
   - les apparitions au scroll ([data-reveal]) et le spotlight
     des cartes : geres par theme.js, partage avec les autres
     pages. Ne pas les redupliquer.

   Le barème affiche vient de dashboardData.js, la meme source
   que le dashboard club. Changer un point la-bas le change
   partout.
   ============================================================ */

import { DEFAULT_POINT_RULES } from "./dashboardData.js";

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const CAN_HOVER = window.matchMedia("(hover: hover)").matches;

const fmtInt = new Intl.NumberFormat("fr-FR");
const fmtEur = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const fmtEur2 = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/* ============================================================
   Barème : une seule source de verite
   ============================================================ */

function renderPointRules() {
  $$("[data-point-rule]").forEach((el) => {
    const value = DEFAULT_POINT_RULES[el.dataset.pointRule];
    if (typeof value !== "number") return;
    // format "short" = juste le nombre (les grandes cartes ont
    // deja "pts / 1 000 vues" dans un <small> a cote).
    el.textContent = el.dataset.pointFormat === "short" ? `+${value}` : `+${value} pts`;
  });
}

/* ============================================================
   Entree de page
   ============================================================ */

function markLoaded() {
  document.body.classList.add("loaded");
}
window.addEventListener("load", markLoaded);
// Repli si les polices tardent : on n'attend pas indefiniment.
setTimeout(markLoaded, 900);

/* ============================================================
   Navigation
   ============================================================ */

function setupNav() {
  const nav = $("#nav");
  if (!nav) return;
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 10);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

function setupMobileMenu() {
  const burger = $("#navBurger");
  const menu = $("#mobileMenu");
  if (!burger || !menu) return;

  const toggle = (force) => {
    const open = typeof force === "boolean" ? force : !document.body.classList.contains("menu-open");
    document.body.classList.toggle("menu-open", open);
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
    menu.setAttribute("aria-hidden", String(!open));
  };

  burger.addEventListener("click", () => toggle());
  $$("a", menu).forEach((a) => a.addEventListener("click", () => toggle(false)));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") toggle(false);
  });
}

/* Souligne l'onglet de la section en cours de lecture. */
function setupScrollspy() {
  if (!("IntersectionObserver" in window)) return;

  const links = new Map();
  $$(".nav-link[data-spy]").forEach((l) => links.set(l.dataset.spy, l));
  const sections = $$("[data-section]");
  if (!sections.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((l) => l.classList.remove("active"));
        links.get(entry.target.id)?.classList.add("active");
      });
    },
    { rootMargin: "-38% 0px -55% 0px" }
  );

  sections.forEach((s) => observer.observe(s));
}

/* ============================================================
   Bandeau defilant
   ============================================================ */

/* Le CSS translate la piste de -50% : il faut donc exactement
   deux copies du contenu pour que la boucle soit invisible. */
function setupMarquee() {
  const track = $("#mqTrack");
  if (!track) return;
  const clone = document.createElement("span");
  clone.setAttribute("aria-hidden", "true");
  clone.style.display = "contents";
  clone.innerHTML = track.innerHTML;
  track.appendChild(clone);
}

/* ============================================================
   Compteur anime
   ============================================================ */

function tween(el, to, { dur = 900, fmt = (v) => fmtInt.format(Math.round(v)) } = {}) {
  const from = el.__val ?? 0;
  el.__val = to;

  if (REDUCED) {
    el.textContent = fmt(to);
    return;
  }

  let t0 = null;
  const frame = (t) => {
    if (t0 === null) t0 = t;
    const p = clamp((t - t0) / dur, 0, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(from + (to - from) * eased);
    if (p < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/* ============================================================
   Hero : inclinaison 3D de la maquette
   ============================================================ */

function setupTilt() {
  const holder = $("#heroApp");
  const win = $("#appWindow");
  if (!holder || !win || !CAN_HOVER || REDUCED) return;

  let rx = 0;
  let ry = 0;
  let targetX = 0;
  let targetY = 0;
  let ticking = false;

  const frame = () => {
    rx += (targetX - rx) * 0.12;
    ry += (targetY - ry) * 0.12;
    win.style.transform = `rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg)`;
    if (Math.abs(targetX - rx) > 0.01 || Math.abs(targetY - ry) > 0.01) {
      requestAnimationFrame(frame);
    } else {
      ticking = false;
    }
  };

  const kick = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(frame);
  };

  holder.addEventListener("pointermove", (e) => {
    const r = holder.getBoundingClientRect();
    targetX = ((e.clientY - r.top) / r.height - 0.5) * -3.2;
    targetY = ((e.clientX - r.left) / r.width - 0.5) * 4.2;
    kick();
  });

  holder.addEventListener("pointerleave", () => {
    targetX = 0;
    targetY = 0;
    kick();
  });
}

/* ============================================================
   Hero : feed d'illustration
   Donnees fictives — ce n'est pas branche sur Supabase.
   ============================================================ */

const AVATAR_GRADIENTS = [
  ["#3a2f4f", "#1c1633"],
  ["#1e2b45", "#0f1626"],
  ["#173a35", "#0c1d1b"],
  ["#45283a", "#22141d"],
  ["#2b3a1e", "#151d0f"],
  ["#1e3345", "#0f1a26"],
];

const FEED = [
  { h: "@lea.mrt", i: "LM", t: "IG STORY", views: 2340, sub: "2 340 vues", pts: "+187 pts" },
  { h: "@noa.dpt", i: "ND", t: "REEL", views: 8120, sub: "8 120 vues", pts: "+203 pts" },
  { h: "@sofia.b", i: "SB", t: "IG STORY", views: 1260, sub: "1 260 vues", pts: "+101 pts" },
  { h: "@marco.lgc", i: "ML", t: "TIKTOK", views: 12480, sub: "12 480 vues", pts: "+312 pts" },
  { h: "@ines.pty", i: "IP", t: "CHECK-IN", views: 0, sub: "présence confirmée", pts: "+15 pts" },
  { h: "@tom.rvx", i: "TR", t: "IG STORY", views: 3980, sub: "3 980 vues", pts: "+318 pts" },
  { h: "@lea.mrt", i: "LM", t: "RÉCOMPENSE", views: 0, sub: "Shot premium", pts: "−250 pts", neg: true, reward: true },
  { h: "@jade.prz", i: "JP", t: "REEL", views: 5700, sub: "5 700 vues", pts: "+142 pts" },
  { h: "@hugo.vlt", i: "HV", t: "CHECK-IN", views: 0, sub: "présence confirmée", pts: "+15 pts" },
  { h: "@ambre.clb", i: "AC", t: "IG STORY", views: 2100, sub: "2 100 vues", pts: "+168 pts" },
  { h: "@dylan.off", i: "DO", t: "TIKTOK", views: 15400, sub: "15 400 vues", pts: "+385 pts" },
  { h: "@sofia.b", i: "SB", t: "RÉCOMPENSE", views: 0, sub: "Coupe-file", pts: "−300 pts", neg: true, reward: true },
];

const CHECK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="#7d7e81" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" stroke-opacity=".45"/><path d="M8.5 12.2l2.4 2.4 4.6-5"/></svg>`;

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}

/* Les handles viennent d'une liste figee du code, jamais d'une
   saisie utilisateur : l'innerHTML est sans risque ici. */
function feedNode(d, animate) {
  const el = document.createElement("div");
  el.className = `feed-item${animate ? " enter" : ""}`;
  const [a, b] = AVATAR_GRADIENTS[Math.abs(hashCode(d.h)) % AVATAR_GRADIENTS.length];
  const isContent = !d.reward && d.views > 0;

  el.innerHTML = `
    <div class="fi-ava" style="--a:${a};--b:${b}">${d.i}</div>
    <div class="fi-main">
      <div class="fi-top">
        <span class="fi-handle">${d.h}</span>
        <span class="fi-tag${d.reward ? " warm" : ""}">${d.t}</span>
      </div>
      <div class="fi-sub">${d.sub}${isContent ? ` · vérifié ${CHECK_SVG}` : ""}${d.reward ? " · débloquée" : ""}</div>
    </div>
    <span class="fi-pts${d.neg ? " neg" : ""}">${d.pts}</span>`;

  return el;
}

function setupHeroFeed() {
  const list = $("#feedList");
  if (!list) return;

  const statViews = $("#statViews");
  const statCpm = $("#statCpm");
  const statClients = $("#statClients");
  const statRewards = $("#statRewards");

  let totViews = 96208;
  let totClients = 297;
  let totRewards = 79;
  let cpm = 2.41;
  let idx = 0;

  const push = (animate) => {
    const d = FEED[idx % FEED.length];
    idx += 1;
    list.insertBefore(feedNode(d, animate), list.firstChild);
    while (list.children.length > 5) list.removeChild(list.lastChild);

    if (d.views > 0) {
      totViews += d.views;
      tween(statViews, totViews, { dur: 800 });
    }
    if (d.reward) {
      totRewards += 1;
      tween(statRewards, totRewards, { dur: 500 });
    }
    if (Math.random() < 0.35) {
      totClients += 1;
      tween(statClients, totClients, { dur: 500 });
    }
    if (idx % 3 === 0) {
      cpm = clamp(cpm + (Math.random() - 0.5) * 0.07, 2.24, 2.58);
      statCpm.textContent = fmtEur2.format(cpm);
    }
  };

  for (let k = 0; k < 4; k += 1) push(false);
  tween(statViews, totViews, { dur: 1600 });
  tween(statClients, totClients, { dur: 1600 });
  tween(statRewards, totRewards, { dur: 1600 });

  if (REDUCED) return;

  // On ne fait tourner le feed que quand le hero est a l'ecran
  // et l'onglet actif : inutile de bruler du CPU sinon.
  let visible = true;
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
    });
    io.observe($("#heroApp"));
  }
  setInterval(() => {
    if (visible && !document.hidden) push(true);
  }, 2800);
}

/* ============================================================
   Manifesto : les mots s'allument au scroll
   ============================================================ */

function setupManifesto() {
  const el = $("#manifestoText");
  if (!el) return;

  const words = el.textContent.trim().split(/\s+/);
  el.innerHTML = words
    .map((w) => {
      // Les mots du "avant Noctify" restent plus sombres.
      const dim = /perd|Aujourd/.test(w) ? " dim" : "";
      const safe = w.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return `<span class="w${dim}">${safe}</span>`;
    })
    .join(" ");

  const spans = $$(".w", el);

  if (REDUCED) {
    spans.forEach((w) => w.classList.add("on"));
    return;
  }

  let ticking = false;
  const scrub = () => {
    ticking = false;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const start = vh * 0.88;
    const end = vh * 0.38;
    const p = clamp((start - r.top) / (r.height + (start - end)), 0, 1);
    const n = Math.floor(p * (spans.length + 2));
    spans.forEach((w, i) => w.classList.toggle("on", i < n));
  };

  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(scrub);
    },
    { passive: true }
  );
  scrub();
}

/* ============================================================
   Etapes : la barre se remplit au fil de la lecture
   ============================================================ */

function setupSteps() {
  const steps = $$("[data-step]");
  const fill = $("#stepsLineFill");
  if (!steps.length || !("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const idx = steps.indexOf(entry.target);
        steps.forEach((s, i) => {
          s.classList.toggle("active", i === idx);
          s.classList.toggle("done", i < idx);
        });
        if (fill) fill.style.height = `${((idx + 1) / steps.length) * 100}%`;
      });
    },
    { rootMargin: "-42% 0px -42% 0px", threshold: 0 }
  );

  steps.forEach((s) => observer.observe(s));
}

/* ============================================================
   Barème : les barres se remplissent a l'arrivee
   ============================================================ */

function setupBaremeBars() {
  const bareme = $(".bareme");
  if (!bareme || !("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        $$(".bt-bar i", entry.target).forEach((bar, i) => {
          bar.style.transitionDelay = `${i * 130}ms`;
          bar.style.width = `${bar.dataset.w}%`;
        });
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.25 }
  );

  observer.observe(bareme);
}

/* ============================================================
   Simulateur
   ============================================================ */

const ADS_CPM = 8;

function setupSimulator() {
  const rP = $("#rP");
  const rV = $("#rV");
  const rC = $("#rC");
  if (!rP || !rV || !rC) return;

  const oP = $("#oP");
  const oV = $("#oV");
  const oC = $("#oC");
  const outViews = $("#outViews");
  const outBudget = $("#outBudget");
  const outCpm = $("#outCpm");
  const cmpVn = $("#cmpVn");
  const cmpAds = $("#cmpAds");
  const cmpVnVal = $("#cmpVnVal");
  const verdict = $("#simVerdict");

  // Colore la portion parcourue du slider (WebKit n'a pas de
  // ::-moz-range-progress equivalent).
  const setFill = (input) => {
    const p = ((input.value - input.min) / (input.max - input.min)) * 100;
    input.style.setProperty("--p", `${p}%`);
  };

  const update = (animate) => {
    const participants = Number(rP.value);
    const views = Number(rV.value);
    const cost = Number(rC.value);

    oP.textContent = fmtInt.format(participants);
    oV.textContent = fmtInt.format(views);
    oC.textContent = fmtEur2.format(cost);

    const totalViews = participants * views;
    const budget = participants * cost;
    const cpm = budget / (totalViews / 1000);

    if (animate) {
      tween(outViews, totalViews, { dur: 800 });
      tween(outBudget, budget, { dur: 800, fmt: (v) => fmtEur.format(Math.round(v * 2) / 2) });
      tween(outCpm, cpm, { dur: 800, fmt: (v) => fmtEur2.format(v) });
    } else {
      outViews.__val = totalViews;
      outViews.textContent = fmtInt.format(totalViews);
      outBudget.__val = budget;
      outBudget.textContent = fmtEur.format(budget);
      outCpm.__val = cpm;
      outCpm.textContent = fmtEur2.format(cpm);
    }

    cmpVnVal.textContent = fmtEur2.format(cpm);

    const maxCpm = Math.max(cpm, ADS_CPM) * 1.12;
    cmpVn.style.width = `${(cpm / maxCpm) * 100}%`;
    cmpAds.style.width = `${(ADS_CPM / maxCpm) * 100}%`;

    if (cpm < ADS_CPM * 0.98) {
      const ratio = (ADS_CPM / cpm).toFixed(1).replace(".", ",");
      verdict.innerHTML = `Soit <b>≈ ${ratio}× moins cher</b> qu'une pub sociale moyenne à 8 € les 1 000 vues.`;
    } else if (cpm > ADS_CPM * 1.02) {
      verdict.innerHTML = `<b>Au-dessus</b> d'une pub sociale à 8 € les 1 000 vues — réduisez le coût de récompense ou visez plus de vues.`;
    } else {
      verdict.innerHTML = `Équivalent à une pub sociale à 8 € les 1 000 vues — ajustez le barème pour passer devant.`;
    }
  };

  [rP, rV, rC].forEach((input) => {
    setFill(input);
    input.addEventListener("input", () => {
      setFill(input);
      update(false);
    });
  });

  update(false);

  // Rejoue les compteurs depuis zero quand la carte entre a l'ecran.
  if (!("IntersectionObserver" in window) || REDUCED) return;
  const card = $(".sim-card");
  if (!card) return;

  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries[0].isIntersecting) return;
      outViews.__val = 0;
      outBudget.__val = 0;
      outCpm.__val = 0;
      update(true);
      observer.disconnect();
    },
    { threshold: 0.3 }
  );
  observer.observe(card);
}

/* ============================================================
   FAQ
   ============================================================ */

function setupFaq() {
  $$(".faq-item").forEach((item) => {
    const question = $(".faq-q", item);
    if (!question) return;

    question.addEventListener("click", () => {
      const wasOpen = item.classList.contains("open");

      // Accordeon : une seule reponse ouverte a la fois.
      $$(".faq-item.open").forEach((open) => {
        open.classList.remove("open");
        $(".faq-q", open)?.setAttribute("aria-expanded", "false");
      });

      if (!wasOpen) {
        item.classList.add("open");
        question.setAttribute("aria-expanded", "true");
      }
    });
  });
}

/* ============================================================
   Formulaire de demande de demo
   ------------------------------------------------------------
   Chemin normal : POST /api/demo-request (fonction serverless
   Vercel, qui insere dans Supabase puis notifie par Resend).

   En dev, `vite` ne sert pas /api : la requete repond 404. On
   bascule alors sur une insertion Supabase directe avec la cle
   anon. La policy RLS demo_requests_public_insert exige club,
   email ET phone non vides — les trois champs sont donc requis.
   ============================================================ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isLocalHost() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

async function insertDemoRequestLocally(payload) {
  const { isSupabaseConfigured, supabase } = await import("./supabaseClient.js");

  if (!isSupabaseConfigured || !supabase) {
    throw new Error(
      "Supabase n'est pas configuré. Ajoutez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.local."
    );
  }

  const { error } = await supabase.from("demo_requests").insert(payload);
  if (error) throw error;
}

async function submitDemoRequest(payload) {
  const response = await fetch("/api/demo-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (response.status === 404 && isLocalHost()) {
    await insertDemoRequestLocally(payload);
    return;
  }

  let result = {};
  try {
    result = await response.json();
  } catch {
    result = {};
  }

  if (!response.ok) {
    throw new Error(result.message || "Impossible d'enregistrer la demande.");
  }
}

function setupContactForm() {
  const form = $("#contactForm");
  if (!form) return;

  const club = $("#fClub");
  const email = $("#fEmail");
  const phone = $("#fPhone");
  const button = $("#formBtn");
  const errorBox = $("#formError");

  const fail = (field, message) => {
    field.closest(".f-field")?.setAttribute("data-error", "");
    errorBox.textContent = message;
    field.focus();
  };

  const clearErrors = () => {
    $$(".f-field[data-error]", form).forEach((f) => f.removeAttribute("data-error"));
    errorBox.textContent = "";
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors();

    const payload = {
      club: club.value.trim(),
      email: email.value.trim().toLowerCase(),
      phone: phone.value.trim(),
    };

    if (!payload.club) return fail(club, "Indiquez le nom de votre établissement.");
    if (!EMAIL_RE.test(payload.email)) return fail(email, "Cette adresse email n'est pas valide.");
    if (!payload.phone) return fail(phone, "Indiquez un numéro pour vous recontacter.");

    const label = button.innerHTML;
    button.disabled = true;
    button.textContent = "Envoi…";

    try {
      await submitDemoRequest(payload);
      form.classList.add("sent");
    } catch (error) {
      errorBox.textContent = `Impossible d'enregistrer la demande : ${error.message || "erreur inconnue"}`;
      button.disabled = false;
      button.innerHTML = label;
    }
  });
}

/* ============================================================
   Init
   ============================================================ */

renderPointRules();
setupNav();
setupMobileMenu();
setupScrollspy();
setupMarquee();
setupTilt();
setupHeroFeed();
setupManifesto();
setupSteps();
setupBaremeBars();
setupSimulator();
setupFaq();
setupContactForm();

const year = $("#year");
if (year) year.textContent = String(new Date().getFullYear());
