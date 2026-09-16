-- 16/09/2026 : le parcours de l'appli des gerants demande l'adresse de
-- l'etablissement (l'appli clubbeur l'affiche). Le gerant ne pouvait pas
-- l'ecrire : seules certaines colonnes lui sont ouvertes en UPDATE, et la
-- RLS limite toujours la ligne a son propre etablissement.
grant update (address) on public.establishments to authenticated;
