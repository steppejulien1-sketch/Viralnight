-- Ajoute un stock maximum configurable par récompense.
-- NULL signifie illimité ; un nombre entier limite le nombre de réclamations possibles.

alter table public.rewards
  add column if not exists max_redemptions integer
    check (max_redemptions is null or max_redemptions >= 0);

comment on column public.rewards.max_redemptions is
  'Nombre maximum de fois où cette récompense peut être réclamée. NULL signifie illimité.';
