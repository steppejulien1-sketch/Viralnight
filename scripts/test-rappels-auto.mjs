import assert from "node:assert/strict";
import { messageRappel, peutRelancer, JOURS_ENTRE_RAPPELS } from "../lib/offres/rappels.js";

const recos = [
  { titre: "Menu offert", cout: 400 },
  { titre: "Café offert", cout: 50 },
  { titre: "Bière offerte", cout: 70 },
];

// Rien a proposer : pas d'e-mail.
assert.equal(messageRappel({ solde: 500, recompenses: [] }), null);

// Assez de points : les recompenses abordables, la plus chere d'abord.
const riche = messageRappel({ solde: 100, recompenses: recos });
assert.match(riche.message, /Tu as 100 points/);
assert.ok(riche.message.indexOf("Bière offerte") < riche.message.indexOf("Café offert"));
assert.ok(!riche.message.includes("Menu offert"));

// Pas assez : la plus proche et ce qui manque.
const pauvre = messageRappel({ solde: 20, recompenses: recos, ig: "chezpaul" });
assert.match(pauvre.sujet, /Plus que 30 points pour café offert/);
assert.match(pauvre.message, /@chezpaul/);

// Une semaine entre deux rappels.
const now = Date.parse("2026-10-10T18:00:00Z");
assert.equal(peutRelancer(null, now), true);
assert.equal(peutRelancer(new Date(now - 2 * 864e5).toISOString(), now), false);
assert.equal(peutRelancer(new Date(now - JOURS_ENTRE_RAPPELS * 864e5).toISOString(), now), true);

console.log("rappels automatiques : ok");
