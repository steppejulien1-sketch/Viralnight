const header = document.querySelector("[data-header]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const nav = document.querySelector("[data-nav]");
const form = document.querySelector("[data-form]");
const pageDeck = document.querySelector("[data-page-deck]");
const pageLinks = Array.from(document.querySelectorAll("[data-page-link]"));
const pageSections = Array.from(document.querySelectorAll("[data-page-section]"));
const briefInputs = document.querySelectorAll("[data-brief-input]");

const numberFormatter = new Intl.NumberFormat("fr-FR");
const currencyFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

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

function updateBriefEstimate() {
  const customers = Number(document.querySelector('[data-brief-input="customers"]')?.value || 0);
  const views = Number(document.querySelector('[data-brief-input="views"]')?.value || 0);
  const budget = Number(document.querySelector('[data-brief-input="budget"]')?.value || 0);
  const rewardCost = Number(document.querySelector('[data-brief-input="rewardCost"]')?.value || 0);

  const cpm = views > 0 ? (budget / views) * 1000 : 0;
  const costPerExpectedCustomer = customers > 0 ? budget / customers : 0;
  const availableRewards = rewardCost > 0 ? Math.floor(budget / rewardCost) : 0;

  document.querySelector('[data-brief-result="cpm"]').textContent = currencyFormatter.format(cpm);
  document.querySelector('[data-brief-result="cpa"]').textContent = currencyFormatter.format(costPerExpectedCustomer);
  document.querySelector('[data-brief-result="rewards"]').textContent = numberFormatter.format(availableRewards);
}

setPage(getPageIndexFromHash(), { resetScroll: true, writeHistory: false });
updateCalculator();
updateBriefEstimate();

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

briefInputs.forEach((input) => {
  input.addEventListener("input", updateBriefEstimate);
});

menuToggle?.addEventListener("click", () => {
  const isOpen = nav.classList.toggle("is-open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
});

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const note = form.querySelector("[data-form-note]");
  const formData = new FormData(form);
  const club = formData.get("club") || "votre établissement";
  const budget = Number(formData.get("monthly_budget") || 0);
  const views = Number(formData.get("monthly_views") || 0);
  const cpm = views > 0 ? (budget / views) * 1000 : 0;

  if (note) {
    note.textContent = `Demande prête pour ${club}. Projection actuelle : ${currencyFormatter.format(cpm)} pour 1 000 vues.`;
  }
});
