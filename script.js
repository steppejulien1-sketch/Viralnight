import { DEFAULT_POINT_RULES, DEFAULT_REWARDS } from "./dashboardData.js";
import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

const header = document.querySelector("[data-header]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const nav = document.querySelector("[data-nav]");
const form = document.querySelector("[data-form]");
const pageDeck = document.querySelector("[data-page-deck]");
const pageLinks = Array.from(document.querySelectorAll("[data-page-link]"));
const pageSections = Array.from(document.querySelectorAll("[data-page-section]"));

const numberFormatter = new Intl.NumberFormat("fr-FR");
const currencyFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});
const rewardThresholds = Object.fromEntries(DEFAULT_REWARDS.map((reward) => [reward.key, reward.pointsRequired]));

let currentPage = 0;

function clampPage(index) {
  return Math.max(0, Math.min(index, pageSections.length - 1));
}

function getHashId() {
  return decodeURIComponent(window.location.hash.replace("#", ""));
}

function getPageIndexFromHash() {
  const hashId = getHashId();
  const hashIndex = pageSections.findIndex((section) => section.id === hashId);
  return hashIndex >= 0 ? hashIndex : 0;
}

function setHeaderState() {
  if (!header) return;
  const section = pageSections[currentPage];
  header.classList.toggle("is-scrolled", currentPage > 0 || (section?.scrollTop || 0) > 16);
}

function setActivePage(id) {
  pageLinks.forEach((link) => {
    link.classList.toggle("is-active", link.dataset.pageLink === id);
  });

  nav?.querySelectorAll("a").forEach((link) => {
    link.classList.toggle("is-active", link.getAttribute("href") === `#${id}`);
  });
}

function formatPoints(value, options = {}) {
  const { signed = true } = options;
  const formatted = `${numberFormatter.format(Math.round(Number(value) || 0))} pts`;
  return signed ? `+${formatted}` : formatted;
}

function getPointRule(key) {
  return DEFAULT_POINT_RULES[key] ?? 0;
}

function getRewardThreshold(key) {
  return rewardThresholds[key] ?? 0;
}

function renderPointScale() {
  document.querySelectorAll("[data-point-rule]").forEach((element) => {
    const value = getPointRule(element.dataset.pointRule);
    element.textContent = formatPoints(value);
  });

  document.querySelectorAll("[data-reward-rule]").forEach((element) => {
    const value = getRewardThreshold(element.dataset.rewardRule);
    element.textContent = formatPoints(value, { signed: false });
  });
}

function closeMenu() {
  nav?.classList.remove("is-open");
  menuToggle?.setAttribute("aria-expanded", "false");
}

function setPage(index, options = {}) {
  if (!pageDeck || pageSections.length === 0) return;

  const nextPage = clampPage(index);
  const { resetScroll = true, writeHistory = true } = options;
  const section = pageSections[nextPage];

  currentPage = nextPage;
  window.scrollTo(0, 0);
  pageDeck.style.setProperty("--page-offset", `-${nextPage * 100}svh`);
  setActivePage(section.id);
  setHeaderState();

  if (resetScroll) {
    section.scrollTop = 0;
  }

  if (writeHistory && window.location.hash !== `#${section.id}`) {
    history.replaceState(null, "", `#${section.id}`);
  }
}

function updateCalculator() {
  const creatorsInput = document.querySelector('[data-input="creators"]');
  const viewsInput = document.querySelector('[data-input="views"]');
  const costInput = document.querySelector('[data-input="cost"]');

  if (!creatorsInput || !viewsInput || !costInput) return;

  const creators = Number(creatorsInput.value);
  const views = Number(viewsInput.value);
  const cost = Number(costInput.value);
  const reach = creators * views;
  const budget = creators * cost;
  const cpm = reach > 0 ? (budget / reach) * 1000 : 0;

  document.querySelector('[data-output="creators"]').textContent = numberFormatter.format(creators);
  document.querySelector('[data-output="views"]').textContent = numberFormatter.format(views);
  document.querySelector('[data-output="cost"]').textContent = currencyFormatter.format(cost);
  document.querySelector('[data-result="reach"]').textContent = numberFormatter.format(reach);
  document.querySelector('[data-result="budget"]').textContent = currencyFormatter.format(budget);
  document.querySelector('[data-result="cpm"]').textContent = currencyFormatter.format(cpm);
}

function getTextFormValue(formData, name) {
  return String(formData.get(name) || "").trim();
}

function buildDemoRequestPayload(formData) {
  return {
    club: getTextFormValue(formData, "club"),
    email: getTextFormValue(formData, "email"),
  };
}

async function handleDemoSubmit(event) {
  event.preventDefault();

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const note = form.querySelector("[data-form-note]");
  const submitButton = form.querySelector('button[type="submit"]');
  const initialButtonText = submitButton?.textContent;
  const formData = new FormData(form);
  const club = getTextFormValue(formData, "club") || "votre établissement";

  if (note) {
    note.textContent = "";
  }

  if (!isSupabaseConfigured || !supabase) {
    if (note) {
      note.textContent =
        "Impossible d'enregistrer la demande : Supabase n'est pas configuré. Ajoutez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.local.";
    }
    return;
  }

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Envoi en cours...";
  }

  try {
    const { error } = await supabase.from("demo_requests").insert(buildDemoRequestPayload(formData));

    if (error) {
      throw error;
    }
  } catch (error) {
    if (note) {
      note.textContent = `Impossible d'enregistrer la demande pour ${club} : ${error.message || "erreur inconnue"}`;
    }
    return;
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = initialButtonText;
    }
  }

  if (note) {
    note.textContent = `Demande enregistrée pour ${club}. Nous vous recontactons rapidement.`;
  }
}

renderPointScale();
setPage(getPageIndexFromHash(), { resetScroll: true, writeHistory: false });
updateCalculator();

pageSections.forEach((section) => {
  section.addEventListener(
    "scroll",
    () => {
      if (section === pageSections[currentPage]) {
        setHeaderState();
      }
    },
    { passive: true },
  );
});

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const targetId = decodeURIComponent(link.getAttribute("href").replace("#", ""));
    const targetIndex = pageSections.findIndex((section) => section.id === targetId);

    if (targetIndex < 0) return;

    event.preventDefault();
    closeMenu();
    setPage(targetIndex);
  });
});

window.addEventListener("hashchange", () => {
  setPage(getPageIndexFromHash(), { resetScroll: true, writeHistory: false });
});

document.querySelectorAll("[data-input]").forEach((input) => {
  input.addEventListener("input", updateCalculator);
});

menuToggle?.addEventListener("click", () => {
  const isOpen = nav.classList.toggle("is-open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
});

form?.addEventListener("submit", handleDemoSubmit);
