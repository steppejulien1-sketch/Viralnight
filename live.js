// Suivi de la soiree en cours.
//
// Un patron de club a besoin de savoir pendant la nuit si ca marche, pas le lendemain :
// combien de monde est entre, si les gens publient, a quelle heure ca decolle. Cette page
// repond a ca en direct, pour qu'il puisse encore agir (lancer un bonus, relancer au micro).
//
// Elle lit directement Supabase avec la cle publique : RLS limite deja chaque owner
// aux donnees de son etablissement, donc aucune route serveur n'est necessaire.

import { isSupabaseConfigured, supabase } from "./supabaseClient.js";
import { escapeHtml } from "./lib/html/escape.js";
import { resolveEventNight, defaultOpeningHours } from "./lib/scheduling/nightDate.js";

/** Rafraichissement automatique : assez court pour etre utile, assez long pour rester discret. */
const INTERVALLE_MS = 30000;

const els = {
  banner: document.getElementById("banner"),
  pulse: document.getElementById("pulse"),
  pulseLabel: document.getElementById("pulse-label"),
  refresh: document.getElementById("refresh"),
  hero: document.getElementById("hero"),
  eventDate: document.getElementById("event-date"),
  eventName: document.getElementById("event-name"),
  eventDj: document.getElementById("event-dj"),
  stats: document.getElementById("stats"),
  curveBlock: document.getElementById("curve-block"),
  hours: document.getElementById("hours"),
  feedBlock: document.getElementById("feed-block"),
  feedSub: document.getElementById("feed-sub"),
  feed: document.getElementById("feed"),
};

const nf = new Intl.NumberFormat("fr-FR");
const num = (v) => nf.format(Math.round(v));

let establishmentId = null;
let minuteur = null;

function setBanner(message, tone = "info") {
  if (!message) {
    els.banner.hidden = true;
    return;
  }
  els.banner.textContent = message;
  els.banner.className = `lv-banner is-${tone}`;
  els.banner.hidden = false;
}

function afficherBlocs(visible) {
  for (const bloc of [els.hero, els.stats, els.curveBlock, els.feedBlock]) bloc.hidden = !visible;
}

function heureDe(iso) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function dateLongue(iso) {
  const [a, m, j] = iso.split("-");
  return new Date(Number(a), Number(m) - 1, Number(j)).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Depuis combien de temps, en clair : "il y a 3 min". */
function ilYA(iso) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.floor(minutes / 60);
  return `il y a ${heures} h ${String(minutes % 60).padStart(2, "0")}`;
}

async function resoudreEtablissement() {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase n'est pas configuré sur cette page.");

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session) throw new Error("Connecte-toi pour suivre ta soirée en direct.");

  const { data, error } = await supabase
    .from("establishment_owners")
    .select("establishment_id")
    .eq("id", sessionData.session.user.id)
    .maybeSingle();

  if (error || !data?.establishment_id) throw new Error("Aucun établissement lié à ce compte.");
  return data.establishment_id;
}

/**
 * Determine la soiree en cours.
 *
 * On resout la nuit courante avec les horaires du club plutot que de prendre la
 * derniere soiree en base : a 3 h du matin, la date du jour n'est pas celle de la soiree.
 */
async function trouverSoireeEnCours() {
  const [{ data: horaires }, { data: reglages }] = await Promise.all([
    supabase.from("establishment_opening_hours").select("*").eq("establishment_id", establishmentId),
    supabase.from("establishment_schedule").select("timezone").eq("establishment_id", establishmentId).maybeSingle(),
  ]);

  const openingHours = horaires?.length
    ? horaires.map((h) => ({ weekday: h.weekday, isOpen: h.is_open, opensAt: h.opens_at, closesAt: h.closes_at }))
    : defaultOpeningHours();

  const nuit = resolveEventNight(new Date(), openingHours, reglages?.timezone || "Europe/Brussels");

  // Hors horaires : on montre la derniere soiree passee, en le disant clairement.
  if (!nuit) {
    const { data } = await supabase
      .from("events")
      .select("*")
      .eq("establishment_id", establishmentId)
      .lte("event_date", new Date().toISOString().slice(0, 10))
      .order("event_date", { ascending: false })
      .limit(1);

    return { event: data?.[0] || null, enCours: false };
  }

  const { data } = await supabase
    .from("events")
    .select("*")
    .eq("establishment_id", establishmentId)
    .eq("event_date", nuit)
    .maybeSingle();

  return { event: data || null, enCours: true, nuit };
}

function renderStats(scans, publications, redemptions) {
  const scanneursUniques = new Set(scans.map((s) => s.customer_id)).size;
  const publieurs = new Set(publications.map((p) => p.customer_id)).size;
  const vues = publications.reduce((somme, p) => somme + (p.views_count || 0), 0);
  const declarees = publications.reduce((somme, p) => somme + (p.declared_views || 0), 0);
  const enAttente = publications.filter((p) => p.status === "pending").length;
  const conversion = scanneursUniques ? Math.round((publieurs / scanneursUniques) * 100) : 0;

  const cartes = [
    { label: "Entrées scannées", valeur: num(scanneursUniques) },
    { label: "Publications reçues", valeur: num(publications.length) },
    {
      label: "Scan → publication",
      valeur: `${conversion} %`,
      ton: conversion >= 30 ? "good" : conversion >= 15 ? "warn" : "bad",
    },
    // Les vues validees sont la seule valeur fiable ; les vues annoncees servent
    // d'estimation en attendant la validation du staff.
    { label: "Vues validées", valeur: num(vues) },
    { label: "Vues annoncées", valeur: num(declarees), discret: true },
    { label: "Récompenses réclamées", valeur: num(redemptions.length) },
    { label: "À valider", valeur: num(enAttente), ton: enAttente > 0 ? "warn" : null },
  ];

  els.stats.innerHTML = cartes
    .map(
      (c) => `
      <div class="lv-stat ${c.discret ? "is-muted" : ""}">
        <span class="lv-stat-value ${c.ton ? `is-${c.ton}` : ""}">${escapeHtml(c.valeur)}</span>
        <span class="lv-stat-label">${escapeHtml(c.label)}</span>
      </div>`,
    )
    .join("");
}

function renderCourbe(scans, publications) {
  // Regroupement par heure locale sur la fenetre de nuit habituelle.
  const heures = [22, 23, 0, 1, 2, 3, 4, 5];
  const seaux = new Map(heures.map((h) => [h, { scans: 0, publications: 0 }]));

  for (const s of scans) {
    const h = new Date(s.scanned_at).getHours();
    if (seaux.has(h)) seaux.get(h).scans += 1;
  }
  for (const p of publications) {
    const h = new Date(p.submitted_at).getHours();
    if (seaux.has(h)) seaux.get(h).publications += 1;
  }

  const max = Math.max(...[...seaux.values()].flatMap((v) => [v.scans, v.publications]), 1);
  const heureCourante = new Date().getHours();

  els.hours.innerHTML = heures
    .map((h) => {
      const v = seaux.get(h);
      return `
        <div class="lv-hour ${h === heureCourante ? "is-now" : ""}">
          <div class="lv-hour-pair">
            <div class="lv-bar is-scans" style="height:${Math.max(2, (v.scans / max) * 100)}%"
              title="${String(h).padStart(2, "0")}h — ${v.scans} entrées"></div>
            <div class="lv-bar is-posts" style="height:${Math.max(2, (v.publications / max) * 100)}%"
              title="${String(h).padStart(2, "0")}h — ${v.publications} publications"></div>
          </div>
          <span class="lv-hour-label">${String(h).padStart(2, "0")}h</span>
        </div>`;
    })
    .join("");
}

const ETIQUETTES_STATUT = { pending: "à valider", validated: "validé", rejected: "rejeté" };

function renderFeed(publications) {
  const recentes = [...publications]
    .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))
    .slice(0, 12);

  els.feedSub.textContent = publications.length
    ? `${publications.length} publication(s) depuis l'ouverture.`
    : "Aucune publication pour l'instant.";

  if (!recentes.length) {
    els.feed.innerHTML = '<li class="lv-empty">Dès qu\'un client enverra son lien, il apparaîtra ici.</li>';
    return;
  }

  els.feed.innerHTML = recentes
    .map((p) => {
      const statut = ETIQUETTES_STATUT[p.status] || p.status;
      const vues = p.views_count || p.declared_views;
      // L'URL vient d'une saisie client : on n'autorise que http/https en lien.
      const lienSur = /^https?:\/\//i.test(p.url || "");
      return `
        <li class="lv-feed-item">
          <span class="lv-time">${escapeHtml(heureDe(p.submitted_at))}</span>
          <span class="lv-plateforme">${escapeHtml(p.platform)}</span>
          <span class="lv-type">${escapeHtml(p.content_type)}</span>
          <span class="lv-vues">${vues ? `${num(vues)} vues` : "—"}</span>
          <span class="lv-statut is-${escapeHtml(p.status)}">${escapeHtml(statut)}</span>
          <span class="lv-quand">${escapeHtml(ilYA(p.submitted_at))}</span>
          ${lienSur ? `<a class="lv-lien" href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer">voir</a>` : ""}
        </li>`;
    })
    .join("");
}

async function charger() {
  try {
    const { event, enCours } = await trouverSoireeEnCours();

    if (!event) {
      afficherBlocs(false);
      setBanner(
        enCours
          ? "Aucune soirée n'a encore démarré : elle se créera au premier scan du QR code."
          : "Aucune soirée enregistrée pour l'instant.",
        "info",
      );
      return;
    }

    const [scansRes, pubsRes, recompensesRes] = await Promise.all([
      supabase.from("qr_scans").select("customer_id, scanned_at").eq("event_id", event.id),
      supabase
        .from("submissions")
        .select("customer_id, platform, content_type, url, views_count, declared_views, status, submitted_at")
        .eq("event_id", event.id),
      supabase.from("reward_redemptions").select("id").eq("event_id", event.id),
    ]);

    const scans = scansRes.data || [];
    const publications = pubsRes.data || [];
    const recompenses = recompensesRes.data || [];

    els.eventDate.textContent = dateLongue(event.event_date);
    els.eventName.textContent = event.name;
    els.eventDj.textContent = event.dj_name ? `Aux platines : ${event.dj_name}` : "Aucun DJ renseigné";

    renderStats(scans, publications, recompenses);
    renderCourbe(scans, publications);
    renderFeed(publications);

    afficherBlocs(true);
    els.pulse.hidden = false;
    els.pulseLabel.textContent = enCours ? "en direct" : "soirée terminée";
    els.pulse.classList.toggle("is-live", enCours);

    setBanner(
      enCours ? null : "Le club est fermé : voici le bilan de la dernière soirée.",
      "info",
    );
  } catch (error) {
    afficherBlocs(false);
    setBanner(error.message, "error");
  }
}

async function init() {
  try {
    establishmentId = await resoudreEtablissement();
  } catch (error) {
    setBanner(error.message, "error");
    return;
  }

  await charger();

  els.refresh.addEventListener("click", charger);

  // Rafraichissement automatique, suspendu quand l'onglet est en arriere-plan :
  // inutile d'interroger la base quand personne ne regarde.
  const demarrer = () => {
    if (!minuteur) minuteur = setInterval(charger, INTERVALLE_MS);
  };
  const arreter = () => {
    clearInterval(minuteur);
    minuteur = null;
  };

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) arreter();
    else {
      charger();
      demarrer();
    }
  });

  demarrer();
}

init();
