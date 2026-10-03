-- 03/10/2026 : Noctify s'ouvre a tous les commerces (site du 29/09).
-- A COLLER dans le SQL Editor de la base B2B (mrukkexghpcqtwvwwcbe) : non applique.
alter table public.establishments drop constraint establishments_category_check;
alter table public.establishments add constraint establishments_category_check
  check (category in ('bar', 'restaurant', 'club', 'cafe', 'boulangerie', 'coiffeur', 'institut', 'boutique', 'event_venue', 'other'));
