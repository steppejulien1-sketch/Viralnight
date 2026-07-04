-- Verrouille le dashboard client aux etablissements dont subscription_status = 'actif'.
-- L'admin ViralNight conserve ses policies separees pour lire/gerer les clients.

create or replace function public.current_establishment_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.establishments e
    where e.id = public.current_establishment_id()
      and e.subscription_status = 'actif'
  );
$$;

grant execute on function public.current_establishment_is_active() to authenticated;

create or replace function public.current_user_can_access_reward(target_reward_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.rewards r
    join public.establishments e on e.id = r.establishment_id
    where r.id = target_reward_id
      and r.establishment_id = public.current_establishment_id()
      and e.subscription_status = 'actif'
  );
$$;

grant execute on function public.current_user_can_access_reward(uuid) to authenticated;

drop policy if exists "submissions_select_own_establishment" on public.submissions;
create policy "submissions_select_own_establishment"
on public.submissions
for select
to authenticated
using (
  establishment_id = public.current_establishment_id()
  and public.current_establishment_is_active()
);

drop policy if exists "submissions_update_own_establishment" on public.submissions;
create policy "submissions_update_own_establishment"
on public.submissions
for update
to authenticated
using (
  establishment_id = public.current_establishment_id()
  and public.current_establishment_is_active()
)
with check (
  establishment_id = public.current_establishment_id()
  and public.current_establishment_is_active()
);

drop policy if exists "rewards_select_own_establishment" on public.rewards;
create policy "rewards_select_own_establishment"
on public.rewards
for select
to authenticated
using (
  establishment_id = public.current_establishment_id()
  and public.current_establishment_is_active()
);

drop policy if exists "rewards_insert_own_establishment" on public.rewards;
create policy "rewards_insert_own_establishment"
on public.rewards
for insert
to authenticated
with check (
  establishment_id = public.current_establishment_id()
  and public.current_establishment_is_active()
);

drop policy if exists "rewards_update_own_establishment" on public.rewards;
create policy "rewards_update_own_establishment"
on public.rewards
for update
to authenticated
using (
  establishment_id = public.current_establishment_id()
  and public.current_establishment_is_active()
)
with check (
  establishment_id = public.current_establishment_id()
  and public.current_establishment_is_active()
);

drop policy if exists "rewards_delete_own_establishment" on public.rewards;
create policy "rewards_delete_own_establishment"
on public.rewards
for delete
to authenticated
using (
  establishment_id = public.current_establishment_id()
  and public.current_establishment_is_active()
);

drop policy if exists "reward_redemptions_select_own_establishment" on public.reward_redemptions;
create policy "reward_redemptions_select_own_establishment"
on public.reward_redemptions
for select
to authenticated
using (public.current_user_can_access_reward(reward_id));

drop policy if exists "reward_redemptions_update_own_establishment" on public.reward_redemptions;
create policy "reward_redemptions_update_own_establishment"
on public.reward_redemptions
for update
to authenticated
using (public.current_user_can_access_reward(reward_id))
with check (public.current_user_can_access_reward(reward_id));

drop policy if exists "establishment_point_rules_select_own" on public.establishment_point_rules;
create policy "establishment_point_rules_select_own"
on public.establishment_point_rules
for select
to authenticated
using (
  establishment_id = public.current_establishment_id()
  and public.current_establishment_is_active()
);

drop policy if exists "establishment_point_rules_insert_own" on public.establishment_point_rules;
create policy "establishment_point_rules_insert_own"
on public.establishment_point_rules
for insert
to authenticated
with check (
  establishment_id = public.current_establishment_id()
  and public.current_establishment_is_active()
);

drop policy if exists "establishment_point_rules_update_own" on public.establishment_point_rules;
create policy "establishment_point_rules_update_own"
on public.establishment_point_rules
for update
to authenticated
using (
  establishment_id = public.current_establishment_id()
  and public.current_establishment_is_active()
)
with check (
  establishment_id = public.current_establishment_id()
  and public.current_establishment_is_active()
);

drop policy if exists "establishment_point_rules_delete_own" on public.establishment_point_rules;
create policy "establishment_point_rules_delete_own"
on public.establishment_point_rules
for delete
to authenticated
using (
  establishment_id = public.current_establishment_id()
  and public.current_establishment_is_active()
);

drop policy if exists "custom_point_rules_select_own" on public.establishment_point_rule_items;
create policy "custom_point_rules_select_own"
on public.establishment_point_rule_items
for select
to authenticated
using (
  establishment_id = public.current_establishment_id()
  and public.current_establishment_is_active()
);

drop policy if exists "custom_point_rules_insert_own" on public.establishment_point_rule_items;
create policy "custom_point_rules_insert_own"
on public.establishment_point_rule_items
for insert
to authenticated
with check (
  establishment_id = public.current_establishment_id()
  and public.current_establishment_is_active()
);

drop policy if exists "custom_point_rules_update_own" on public.establishment_point_rule_items;
create policy "custom_point_rules_update_own"
on public.establishment_point_rule_items
for update
to authenticated
using (
  establishment_id = public.current_establishment_id()
  and public.current_establishment_is_active()
)
with check (
  establishment_id = public.current_establishment_id()
  and public.current_establishment_is_active()
);

drop policy if exists "custom_point_rules_delete_own" on public.establishment_point_rule_items;
create policy "custom_point_rules_delete_own"
on public.establishment_point_rule_items
for delete
to authenticated
using (
  establishment_id = public.current_establishment_id()
  and public.current_establishment_is_active()
);
