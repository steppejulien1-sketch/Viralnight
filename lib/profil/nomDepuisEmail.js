// Le nom de la personne, "Prenom Nom", sans le lui demander.
//
// Julien, 12/09/2026, capture de DUSK a l'appui : "j'ai juste mis mon email
// et ils m'ont bien mis mon nom prenom dans le bon ordre, je veux que tu
// fasses ca". Le profil affichait jusque-la la partie avant le @ telle
// quelle ("julien.steppe", "steppejulien1").
//
// Deux sources, dans cet ordre :
//   1. Ce que le fournisseur de connexion a DONNE. Google et Apple
//      transmettent le vrai nom (user_metadata.full_name / given_name) :
//      c'est tres probablement ce que fait DUSK. Rien a deviner.
//   2. Sinon, l'adresse e-mail. "julien.steppe", "steppe.julien",
//      "steppejulien1" donnent tous "Julien Steppe" : un prenom connu est
//      cherche dans l'adresse, le reste est le nom. C'est le prenom qui
//      dit l'ordre, pas sa position dans l'adresse.
//
// ⚠️ ON NE DEVINE PAS SANS PRENOM RECONNU. "gaming.pro" ne donne pas
// "Gaming Pro" : sans prenom de la liste, la fonction rend null et le
// profil garde le pseudo. Un nom invente affiche en gros en haut du profil
// est pire que pas de nom. La personne corrige dans Reglages de toute facon.

// Prenoms courants en Belgique et en France, avec leurs accents -- une
// adresse e-mail n'en porte jamais, c'est cette liste qui les rend.
// Composes (Jean-Pierre) et prenoms d'origines diverses : Bruxelles.
const PRENOMS = `
Adam Adèle Adrien Agathe Ahmed Aicha Aïcha Alain Alan Albert Alex Alexandra Alexandre Alexia Alexis Alice Alicia
Aline Alix Allan Amandine Amaury Ambre Amélie Amine Amir Anaïs Anastasia Andréa Andrea André Andy Ange Angèle
Angelo Anna Anne Annabelle Anne-Sophie Anthony Antoine Antonin Antonio Apolline Arnaud Arthur Aude Audrey Augustin
Aurélie Aurélien Aurore Axel Axelle Aya Ayoub Baptiste Bastien Béatrice Benjamin Benoît Bernard Bilal Blanche
Bruno Camille Candice Capucine Carla Carlos Carole Caroline Cassandra Catherine Cédric Céline Charles Charlie
Charline Charlotte Chiara Chloé Christelle Christian Christophe Claire Clara Clarisse Claude Clémence Clément
Cléo Coline Colin Constance Corentin Cyril Cyrine Damien Daniel Daniela David Davide Dimitri Diane Diego Dorian
Dylan Eden Édouard Elena Eléonore Éléonore Elias Élie Eliot Elisa Élisa Élise Ella Elliot Éloïse Elsa Emma
Emmanuel Emilie Émilie Émile Émilien Enzo Eric Éric Erwan Estelle Esteban Ethan Étienne Eva Ève Fabien Fabio
Fabrice Fanny Farah Fatima Fatma Félix Fiona Flavie Flavien Florence Florent Florian Francesco Francis François
Françoise Frédéric Gabriel Gabriella Gabrielle Gaël Gaëlle Gaétan Gaëtan Gaspard Gauthier Geoffrey Georges Gérald
Giovanni Giulia Grégoire Grégory Guillaume Gustave Hamza Hanna Hannah Hassan Hélène Henri Hugo Hugues Ibrahim Ilyas
Ilias Imane Inès Iris Isabelle Ismaël Jade Jacques Jana Jason Jean Jean-Baptiste Jean-François Jean-Luc
Jean-Marc Jean-Michel Jean-Philippe Jean-Pierre Jeanne Jennifer Jérémie Jérémy Jérôme Jessica Joachim Joël Johan
Johanna John Jonas Jonathan Jordan Joris Joseph Joséphine Joshua Josué Juan Jules Julia Julian Julie Julien
Juliette Justine Karim Karima Karine Kathleen Kelly Kenza Kevin Kévin Khadija Killian Kilian Laetitia Laëtitia
Lara Laura Laure Laurence Laurent Léa Léandre Léna Léo Léon Léonard Léonie Léopold Lila Lilou Lina Lionel Lisa
Lise Lola Loïc Loïs Lorenzo Lou Louis Louise Luc Luca Lucas Lucie Lucien Ludovic Luna Maël Maëlle Maëva Mahdi
Malik Manon Manuel Marc Marco Margaux Margot Maria Marie Marie-Claire Marie-Ève Marine Mario Marion Marius Marwa
Marwan Mathias Mathieu Mathilde Mathis Matteo Matthew Matthias Matthieu Maxence Maxime Maximilien Mehdi Mélanie
Mélissa Mélodie Michaël Michel Mickaël Milan Mohamed Mohammed Morgane Mounir Myriam Nadia Naël Naomi Nathalie Nathan
Nicolas Nina Noah Noam Noé Noémie Nora Norah Nour Océane Olivia Olivier Omar Oscar Pascal Patricia Patrick Paul
Pauline Pedro Philippe Pierre Pierre-Antoine Quentin Rachid Rafael Raphaël Raphaëlle Rayan Rémi Rémy Renaud Richard
Robin Romain Romane Roméo Rose Ryan Sabrina Salma Salomé Samia Samir Samuel Sandra Sara Sarah Sébastien Selma
Serge Simon Sofia Sofiane Sophia Sophie Stéphane Stéphanie Sven Sylvain Sylvie Tanguy Tatiana Thais Thaïs
Théo Théodore Thibault Thibaut Thierry Thomas Timothée Tom Tristan Ugo Valentin Valentine Valérie Vanessa Victor
Victoria Vincent Violette Virginie Walid Wassim Xavier Yanis Yann Yannick Yasmine Yassine Yohan Youssef Yves
Zakaria Zoé Zoë Wout Pieter Bram Sander Lotte Anke Jens Lars Stijn Thijs Ruben Jasper Noor Fien Lien Wim Koen
Luis Carmen Pablo Sergio Ana Ines Tiago Joao Rui Marta Nuno Mehmet Emre Elif Zeynep Can Burak Tomasz Piotr Kasia
Oumar Moussa Aminata Fatou Mamadou Ibrahima Awa Grace Josh Jack Harry James Emily Olivia Chris Mike Nick Max Sam
`.trim().split(/\s+/);

// Particules qui restent en minuscules au milieu d'un nom ("Van den Bossche").
const PARTICULES = new Set(["de", "du", "des", "la", "le", "der", "den", "von", "van", "da", "di", "del"]);

function sansAccents(texte) {
  return texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// cle sans accents -> forme ecrite. Si deux formes existent (Zoé / Zoë),
// la premiere de la liste gagne.
const INDEX = new Map();
for (const prenom of PRENOMS) {
  const cle = sansAccents(prenom);
  if (!INDEX.has(cle)) INDEX.set(cle, prenom);
}
// Du plus long au plus court : dans "marieclairedupont", "marie-claire"
// doit passer avant "marie". Les composes se cherchent aussi colles.
const CLES_COLLEES = [...INDEX.keys()]
  .map((cle) => ({ colle: cle.replace(/-/g, ""), cle }))
  .sort((a, b) => b.colle.length - a.colle.length);

function capitaliser(mot) {
  return mot
    .split("-")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join("-");
}

function ecrireNom(morceaux) {
  return morceaux
    .map((mot, i) => (i > 0 && PARTICULES.has(mot) ? mot : capitaliser(mot)))
    .join(" ");
}

// "julien.steppe" / "steppe_julien" / "steppejulien1" -> { prenom, nom }.
// Rend null quand aucun prenom de la liste n'est reconnu.
export function nomDepuisEmail(email) {
  const local = String(email || "").split("@")[0].split("+")[0];
  const morceaux = sansAccents(local)
    .replace(/[0-9]+/g, " ")
    .split(/[._\s]+/)
    .map((m) => m.replace(/^-+|-+$/g, ""))
    .filter((m) => /^[a-z-]+$/.test(m));
  if (!morceaux.length) return null;

  // Plusieurs morceaux : celui qui est un prenom connu est le prenom,
  // ou qu'il soit. Les autres, dans leur ordre, font le nom.
  if (morceaux.length > 1) {
    const i = morceaux.findIndex((m) => INDEX.has(m));
    if (i === -1) return null;
    const reste = morceaux.filter((_, j) => j !== i);
    // Une initiale seule ("j.steppe", "julien.s") n'est pas un nom.
    if (reste.every((m) => m.length < 2)) return { prenom: INDEX.get(morceaux[i]), nom: "" };
    return { prenom: INDEX.get(morceaux[i]), nom: ecrireNom(reste) };
  }

  const mot = morceaux[0];
  if (INDEX.has(mot)) return { prenom: INDEX.get(mot), nom: "" };

  // Un seul bloc colle : un prenom connu au debut ou a la fin, le reste
  // est le nom. Garde-fous contre les faux positifs : le nom restant fait
  // au moins 4 lettres, 5 quand le prenom est court ("samsung" n'est pas
  // "Sam Sung").
  for (const { colle, cle } of CLES_COLLEES) {
    const minimum = colle.length <= 3 ? 5 : 4;
    if (mot.length - colle.length < minimum) continue;
    if (mot.endsWith(colle)) {
      return { prenom: INDEX.get(cle), nom: ecrireNom([mot.slice(0, -colle.length)]) };
    }
    if (mot.startsWith(colle)) {
      return { prenom: INDEX.get(cle), nom: ecrireNom([mot.slice(colle.length)]) };
    }
  }
  return null;
}

// Le nom a afficher en haut du profil, ou null s'il n'y en a aucun de sur.
// `metadata` = session.user.user_metadata (Google, Apple, ou le nom corrige
// par la personne dans Reglages, range au meme endroit).
export function nomAffiche({ metadata, email } = {}) {
  const meta = metadata || {};
  const propre = (v) => (typeof v === "string" && v.trim() && !v.includes("@") ? v.trim() : "");
  const complet = propre(meta.full_name) || propre(meta.name);
  if (complet) return complet;
  const assemble = [propre(meta.given_name), propre(meta.family_name)].filter(Boolean).join(" ");
  if (assemble) return assemble;
  const devine = nomDepuisEmail(email);
  if (!devine) return null;
  return devine.nom ? `${devine.prenom} ${devine.nom}` : devine.prenom;
}
