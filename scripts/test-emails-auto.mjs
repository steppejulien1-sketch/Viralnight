import assert from "node:assert/strict";
import { choisirEmail, contenuEmail, lireReglages, codeCoupon, estSonAnniversaire } from "../lib/offres/automatiques.js";

const J = 864e5;
const now = Date.parse("2026-10-10T16:00:00Z");
const r = lireReglages({ absents: { coupon: "Un café offert", jours: 5 } });

// Reglages bornes et completes.
assert.equal(r.absents.jours, 14);
assert.equal(r.anniversaire.actif, true);
assert.equal(lireReglages({ hebdo: { actif: false } }).hebdo.actif, false);

// Anniversaire : le jour J a Bruxelles, une fois par an.
assert.equal(estSonAnniversaire("2004-10-10", now), true);
assert.equal(choisirEmail({ maintenant: now, reglages: r, dateNaissance: "2004-10-10", premiereVisite: now - 90 * J, derniereVisite: now - J }), "anniversaire");
assert.notEqual(choisirEmail({ maintenant: now, reglages: r, dateNaissance: "2004-10-10", premiereVisite: now - 90 * J, derniereVisite: now - J, dernierEnvoi: { anniversaire: now - 2 * J, hebdo: now - J } }), "anniversaire");

// Bienvenue : le lendemain du premier passage, une seule fois.
assert.equal(choisirEmail({ maintenant: now, reglages: r, premiereVisite: now - 26 * 3600e3, derniereVisite: now - 26 * 3600e3 }), "bienvenue");
assert.equal(choisirEmail({ maintenant: now, reglages: r, premiereVisite: now - 2 * 3600e3, derniereVisite: now - 2 * 3600e3, dernierEnvoi: { hebdo: now } }), null);

// Absents : une fois par absence.
assert.equal(choisirEmail({ maintenant: now, reglages: r, premiereVisite: now - 90 * J, derniereVisite: now - 20 * J }), "absents");
assert.notEqual(choisirEmail({ maintenant: now, reglages: r, premiereVisite: now - 90 * J, derniereVisite: now - 20 * J, dernierEnvoi: { absents: now - 3 * J } }), "absents");

// Hebdo : pas juste apres un autre e-mail.
assert.equal(choisirEmail({ maintenant: now, reglages: r, premiereVisite: now - 90 * J, derniereVisite: now - 3 * J, dernierEnvoi: { bienvenue: now - J } }), null);

// Le coupon : un code stable, et le texte du gerant dans l'e-mail.
assert.equal(codeCoupon("Chez Paul", "u", "c", "absents", "2026-10-10"), codeCoupon("Chez Paul", "u", "c", "absents", "2026-10-10"));
assert.match(codeCoupon("Chez Paul", "u", "c", "absents", "2026-10-10"), /^CHE-[A-Z2-9]{4}$/);
const e = contenuEmail("absents", { lieu: "Chez Paul", prenom: "", solde: 80, recompenses: [], reglages: r, userId: "u", clubId: "c", maintenant: now });
assert.match(e.message, /Pour ton retour : un café offert./);
assert.ok(e.coupon && e.coupon.code);

console.log("e-mails automatiques : ok");
