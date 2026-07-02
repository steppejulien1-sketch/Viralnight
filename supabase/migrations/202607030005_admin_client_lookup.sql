-- Permet au compte admin ViralNight de charger le dashboard d'un client via l'email owner.
-- Les clients gardent leurs policies existantes : ils ne voient que leur propre établissement.

drop policy if exists "establishment_owners_select_viralnight_admin" on public.establishment_owners;
create policy "establishment_owners_select_viralnight_admin"
on public.establishment_owners
for select
to authenticated
using (public.is_viralnight_admin());

drop policy if exists "point_rules_select_viralnight_admin" on public.establishment_point_rules;
create policy "point_rules_select_viralnight_admin"
on public.establishment_point_rules
for select
to authenticated
using (public.is_viralnight_admin());

drop policy if exists "point_rules_write_viralnight_admin" on public.establishment_point_rules;
create policy "point_rules_write_viralnight_admin"
on public.establishment_point_rules
for all
to authenticated
using (public.is_viralnight_admin())
with check (public.is_viralnight_admin());

drop policy if exists "rewards_select_viralnight_admin" on public.rewards;
create policy "rewards_select_viralnight_admin"
on public.rewards
for select
to authenticated
using (public.is_viralnight_admin());

drop policy if exists "rewards_write_viralnight_admin" on public.rewards;
create policy "rewards_write_viralnight_admin"
on public.rewards
for all
to authenticated
using (public.is_viralnight_admin())
with check (public.is_viralnight_admin());

drop policy if exists "reward_redemptions_select_viralnight_admin" on public.reward_redemptions;
create policy "reward_redemptions_select_viralnight_admin"
on public.reward_redemptions
for select
to authenticated
using (public.is_viralnight_admin());

drop policy if exists "custom_point_rules_select_viralnight_admin" on public.establishment_point_rule_items;
create policy "custom_point_rules_select_viralnight_admin"
on public.establishment_point_rule_items
for select
to authenticated
using (public.is_viralnight_admin());

drop policy if exists "custom_point_rules_write_viralnight_admin" on public.establishment_point_rule_items;
create policy "custom_point_rules_write_viralnight_admin"
on public.establishment_point_rule_items
for all
to authenticated
using (public.is_viralnight_admin())
with check (public.is_viralnight_admin());

grant select on public.establishment_owners to authenticated;
grant select, insert, update, delete on public.establishment_point_rules to authenticated;
grant select, insert, update, delete on public.rewards to authenticated;
grant select on public.reward_redemptions to authenticated;
