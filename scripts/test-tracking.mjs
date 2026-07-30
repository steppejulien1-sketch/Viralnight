// Tests de la collecte : validation des entrees publiques et reconnaissance des liens.
// Ces routes sont publiques et ecrivent en base avec la cle service_role :
// tout ce qui n'est pas strictement valide doit etre refuse.

import { parseSocialUrl } from "../api/track-post.js";
import { isValidCustomerId, isValidPublicCode } from "../lib/tracking/publicEndpoint.js";
import { buildScanUrl, renderQrSvg } from "../lib/tracking/qrCode.js";

let passed = 0, failed = 0;
const check = (label, cond, detail = "") => {
  if (cond) { passed++; console.log(`  OK   ${label}`); }
  else { failed++; console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`); }
};

console.log("\nValidation du code etablissement");
check("code valide accepte", isValidPublicCode("ABCD2345"));
check("minuscules acceptees", isValidPublicCode("abcd2345"));
check("caracteres ambigus refuses (O/0/I/1)", !isValidPublicCode("ABCDO123"));
check("longueur incorrecte refusee", !isValidPublicCode("ABC"));
check("injection SQL refusee", !isValidPublicCode("' OR 1=1--"));
check("valeur vide refusee", !isValidPublicCode(""));

console.log("\nValidation de l'identifiant client");
check("UUID v4 accepte", isValidCustomerId("3f2504e0-4f89-41d3-9a0c-0305e82c3301"));
check("texte libre refuse", !isValidCustomerId("admin"));
check("UUID mal forme refuse", !isValidCustomerId("3f2504e0-4f89-41d3-9a0c"));
check("non-chaine refusee", !isValidCustomerId(42));

console.log("\nReconnaissance des liens sociaux");
check("Instagram reconnu", parseSocialUrl("https://www.instagram.com/p/ABC123/")?.platform === "instagram");
check("TikTok reconnu", parseSocialUrl("https://vm.tiktok.com/ZM123/")?.platform === "tiktok");
check("YouTube court reconnu", parseSocialUrl("https://youtu.be/abc")?.platform === "youtube");
check("site non supporte refuse", parseSocialUrl("https://exemple.com/x") === null);
check("javascript: refuse", parseSocialUrl("javascript:alert(1)") === null);
check("texte non URL refuse", parseSocialUrl("coucou") === null);
check(
  "parametres de suivi retires",
  parseSocialUrl("https://instagram.com/p/ABC/?igshid=xyz&utm_source=a")?.url === "https://instagram.com/p/ABC/",
);
check(
  "sous-domaine mobile normalise",
  parseSocialUrl("https://m.tiktok.com/@a/video/1")?.platform === "tiktok",
);

console.log("\nQR code");
const url = buildScanUrl("https://viralnight.example", "abcd2345");
check("URL de scan construite", url === "https://viralnight.example/scan.html?c=ABCD2345", url);
const svg = await renderQrSvg(url);
check("SVG genere", svg.startsWith("<svg") && svg.includes("</svg>"));
check("SVG non vide", svg.length > 500);

console.log(`\n${passed} test(s) OK, ${failed} echec(s).`);
if (failed > 0) process.exit(1);
