-- Nettoie la table des demandes de demo.
-- Le formulaire public ne conserve plus que le nom du club, l'email et le telephone.

alter table public.demo_requests
  drop column if exists city,
  drop column if exists social,
  drop column if exists contact_name,
  drop column if exists role,
  drop column if exists objectives,
  drop column if exists extra_customers,
  drop column if exists monthly_views,
  drop column if exists monthly_budget,
  drop column if exists reward_cost,
  drop column if exists campaign_type,
  drop column if exists context,
  drop column if exists estimated_cpm,
  drop column if exists estimated_cpa,
  drop column if exists estimated_rewards,
  drop column if exists status,
  drop column if exists establishment_type;

drop policy if exists "demo_requests_public_insert" on public.demo_requests;
create policy "demo_requests_public_insert"
on public.demo_requests
for insert
to anon, authenticated
with check (
  length(trim(club)) > 0
  and position('@' in email) > 1
  and length(trim(phone)) > 0
);
