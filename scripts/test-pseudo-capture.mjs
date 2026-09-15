// Tests du pseudo lu sur une capture de profil Instagram. Les textes sont
// ceux qu'a rendus Tesseract sur de vraies captures (15/09/2026).

import { pseudoDepuisTexteOcr, zonePseudo } from "../lib/profil/pseudoDepuisCapture.js";

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed += 1;
    console.log(`  OK   ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}\n       attendu: ${JSON.stringify(expected)}\n       obtenu : ${JSON.stringify(actual)}`);
  }
}

console.log("\npseudoDepuisTexteOcr — lectures reelles");
check("barre coupee, mode clair", pseudoDepuisTexteOcr("6 julien.stpt ve |\n"), "julien.stpt");
check("image entiere, heure et cadenas", pseudoDepuisTexteOcr("17:14 wl. Te)\n+ 8 julien.stpt + ¢ —\nJe n'arrive"), "julien.stpt");
check("petite capture avec l'heure", pseudoDepuisTexteOcr("3:27 ol = i\n8 julien.stpt v\n\npinion\n"), "julien.stpt");
check("le fil, pas un profil", pseudoDepuisTexteOcr("Pour vous v\n"), null);
check("rien de lu", pseudoDepuisTexteOcr(""), null);

console.log("\npseudoDepuisTexteOcr — formes de pseudo");
check("tiret bas", pseudoDepuisTexteOcr("8 lea_martin v"), "lea_martin");
check("lettres seules", pseudoDepuisTexteOcr("6 camille v"), "camille");
check("majuscules ramenees", pseudoDepuisTexteOcr("6 Mae.CMF v"), "mae.cmf");
check("point final de la lecture retire", pseudoDepuisTexteOcr("6 camille. v"), "camille");
check("chiffres seuls ecartes", pseudoDepuisTexteOcr("8 1234 v"), null);

console.log("\nzonePseudo");
check("capture iPhone", zonePseudo(1170, 2532), { x: 140, y: 89, largeur: 889, hauteur: 203 });
check("recadrage trapu : le haut", zonePseudo(360, 276), { x: 43, y: 0, largeur: 274, hauteur: 124 });
check("sans taille", zonePseudo(0, 0), null);

console.log(`\n${passed} OK, ${failed} en echec`);
if (failed) process.exit(1);
