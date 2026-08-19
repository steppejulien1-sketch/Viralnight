// Lie le compte Google de Julien (julien.steppe123@gmail.com) au club
// Mirage dans establishment_owners, pour qu'une connexion reelle sur
// app.html affiche le vrai dashboard de Mirage au lieu de l'etat "aucun
// etablissement" (table establishment_owners vide jusqu'ici).
//
// Idempotent : si la ligne existe deja, ne fait rien.

const V = require("./lib_b2b.cjs");

const EMAIL = "julien.steppe123@gmail.com";

(async () => {
  const utilisateur = await V.sql(
    `select id, email from auth.users where lower(email) = lower('${EMAIL}') limit 1;`
  );
  if (!utilisateur || !utilisateur.length) {
    console.error(`Aucun compte auth.users pour ${EMAIL} — il faut d'abord se connecter au moins une fois avec Google sur le site pour que le compte existe.`);
    process.exit(1);
  }
  const userId = utilisateur[0].id;
  console.log("compte trouve :", userId, utilisateur[0].email);

  const club = await V.sql(`select id, name from public.establishments where name = 'Mirage' limit 1;`);
  if (!club || !club.length) {
    console.error("Aucun etablissement 'Mirage' trouve dans public.establishments.");
    process.exit(1);
  }
  const establishmentId = club[0].id;
  console.log("club trouve :", establishmentId, club[0].name);

  const deja = await V.sql(`select id from public.establishment_owners where id = '${userId}';`);
  if (deja && deja.length) {
    console.log("deja lie, rien a faire.");
    return;
  }

  await V.sql(
    `insert into public.establishment_owners (id, email, establishment_id, role)
     values ('${userId}', '${EMAIL}', '${establishmentId}', 'owner');`
  );
  console.log("lie : julien.steppe123@gmail.com -> Mirage (owner)");
})().catch((e) => { console.error("ECHEC:", e.message); process.exit(1); });
