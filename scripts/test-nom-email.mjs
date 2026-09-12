// Tests du nom devine depuis l'adresse e-mail (profil de l'appli clubbeur).
// Les adresses sont inventees.

import { nomDepuisEmail, nomAffiche } from "../lib/profil/nomDepuisEmail.js";

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

const nom = (email) => nomAffiche({ email });

console.log("\nnomAffiche — l'ordre vient du prenom, pas de l'adresse");
check("prenom.nom", nom("julien.dupont@gmail.com"), "Julien Dupont");
check("nom.prenom", nom("dupont.julien@gmail.com"), "Julien Dupont");
check("nomprenom colles + chiffre", nom("dupontjulien1@gmail.com"), "Julien Dupont");
check("prenomnom colles", nom("juliendupont@hotmail.fr"), "Julien Dupont");
check("underscore", nom("lea_martin@outlook.com"), "Léa Martin");
check("accents rendus au prenom", nom("helene.durand@gmail.com"), "Hélène Durand");
check("prenom compose", nom("jean-pierre.lambert@gmail.com"), "Jean-Pierre Lambert");
check("prenom compose colle", nom("jeanpierrelambert@gmail.com"), "Jean-Pierre Lambert");
check("prenom hors liste (Sofie) : rien", nom("sofie.van.den.bossche@telenet.be"), null);
check("particule avec prenom connu", nom("lotte.van.den.bossche@telenet.be"), "Lotte Van den Bossche");
check("nom en deux morceaux", nom("mohamed.el.amrani@gmail.com"), "Mohamed El Amrani");
check("alias +soiree ignore", nom("camille.roux+soiree@gmail.com"), "Camille Roux");
check("prenom seul", nom("lucas@gmail.com"), "Lucas");
check("prenom seul avec chiffres", nom("lucas1998@gmail.com"), "Lucas");
check("initiale seule a cote", nom("julien.d@gmail.com"), "Julien");

console.log("\nnomAffiche — pas de nom invente");
check("aucun prenom connu", nom("gaming.pro@gmail.com"), null);
check("adresse generique", nom("contact@club.be"), null);
check("faux positif court (sam+sung)", nom("samsung@gmail.com"), null);
check("vide", nom(""), null);
check("sans email", nomAffiche({}), null);

console.log("\nnomAffiche — ce que Google ou Apple ont donne passe avant");
check("full_name", nomAffiche({ metadata: { full_name: "Julie Lemaire" }, email: "xx.julien@gmail.com" }), "Julie Lemaire");
check("given + family", nomAffiche({ metadata: { given_name: "Inès", family_name: "Benali" }, email: "a@b.c" }), "Inès Benali");
check("name qui est une adresse ignore", nomAffiche({ metadata: { name: "julien.dupont@gmail.com" }, email: "julien.dupont@gmail.com" }), "Julien Dupont");

console.log("\nnomDepuisEmail — structure");
const r = nomDepuisEmail("dupont.julien@gmail.com");
check("prenom", r && r.prenom, "Julien");
check("nom", r && r.nom, "Dupont");

console.log(`\n${passed} OK, ${failed} en echec`);
if (failed) process.exit(1);
