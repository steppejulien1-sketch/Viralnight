// Tests de l'echappement HTML. Les valeurs testees correspondent a ce qu'un client
// peut saisir dans un titre de recompense ou un nom de DJ.

import { escapeHtml } from "../lib/html/escape.js";

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) {
    passed += 1;
    console.log(`  OK   ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}\n       attendu: ${expected}\n       obtenu : ${actual}`);
  }
}

console.log("\nescapeHtml — injections");

check(
  "balise script",
  escapeHtml('<script>alert(1)</script>'),
  "&lt;script&gt;alert(1)&lt;/script&gt;",
);

check(
  "img onerror (le vecteur le plus courant)",
  escapeHtml('<img src=x onerror=alert(1)>'),
  "&lt;img src=x onerror=alert(1)&gt;",
);

check(
  "sortie d'attribut par guillemet",
  escapeHtml('" onmouseover="alert(1)'),
  "&quot; onmouseover=&quot;alert(1)",
);

check("apostrophe", escapeHtml("l'entree"), "l&#39;entree");

check("esperluette echappee une seule fois", escapeHtml("Bar & Club"), "Bar &amp; Club");

console.log("\nescapeHtml — valeurs normales et vides");

check("titre normal inchange", escapeHtml("Entree gratuite"), "Entree gratuite");
check("accents preserves", escapeHtml("Récompense privée"), "Récompense privée");
check("null", escapeHtml(null), "");
check("undefined", escapeHtml(undefined), "");
check("nombre", escapeHtml(42), "42");

console.log(`\n${passed} test(s) OK, ${failed} echec(s).`);
if (failed > 0) process.exit(1);
