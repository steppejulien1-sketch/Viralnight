-- ============================================================================
-- ViralNight — Test de la collecte, a lancer APRES SETUP_COMPLET.sql
--
-- Colle ce fichier dans le SQL Editor et clique sur Run.
--
-- Il cree un etablissement de test, simule des scans et des publications a des
-- heures precises, et verifie que les triggers rattachent tout a la bonne soiree.
--
-- IMPORTANT : tout est execute dans une transaction terminee par ROLLBACK.
-- Aucune donnee n'est conservee, tes vraies soirees ne sont pas touchees.
--
-- Resultat attendu en fin d'execution : "TOUS LES TESTS SONT PASSES".
-- En cas d'echec, l'execution s'arrete avec le nom du test fautif.
-- ============================================================================

begin;

do $$
declare
  v_etab uuid;
  v_reward uuid;
  v_event_vendredi uuid;
  v_resolue date;
  v_event_id uuid;
  v_count integer;
  v_tests integer := 0;

  -- Vendredi 7 aout 2026 et dimanche 9 aout 2026, dates fixes pour un test reproductible.
  c_vendredi constant date := '2026-08-07';
  c_dimanche constant date := '2026-08-09';
begin
  ------------------------------------------------------------------
  -- Preparation : un etablissement ouvert vendredi 22h-06h et dimanche 15h-23h
  ------------------------------------------------------------------
  insert into public.establishments (name, city, category, subscription_status)
  values ('ZZ TEST ViralNight', 'Test', 'club', 'essai')
  returning id into v_etab;

  if v_etab is null then
    raise exception 'ECHEC : impossible de creer l''etablissement de test.';
  end if;

  -- Le code public doit avoir ete genere automatiquement par le trigger.
  v_tests := v_tests + 1;
  perform 1 from public.establishments where id = v_etab and public_code is not null and length(public_code) = 8;
  if not found then
    raise exception 'ECHEC test %: le code public n''a pas ete genere automatiquement.', v_tests;
  end if;
  raise notice 'OK  %  Code public genere automatiquement', v_tests;

  insert into public.establishment_schedule (establishment_id, timezone, auto_create_events, event_name_template)
  values (v_etab, 'Europe/Brussels', true, 'Soiree du {date}');

  insert into public.establishment_opening_hours (establishment_id, weekday, is_open, opens_at, closes_at)
  values
    (v_etab, 5, true,  '22:00', '06:00'),  -- vendredi soir, traverse minuit
    (v_etab, 0, true,  '15:00', '23:00'),  -- dimanche apres-midi, ne traverse pas minuit
    (v_etab, 1, false, null,    null),     -- lundi ferme
    (v_etab, 2, false, null,    null),
    (v_etab, 3, false, null,    null),
    (v_etab, 4, false, null,    null),
    (v_etab, 6, false, null,    null);

  insert into public.rewards (establishment_id, title, points_required, active)
  values (v_etab, 'ZZ TEST Shot', 70, true)
  returning id into v_reward;

  ------------------------------------------------------------------
  -- Test : resolution de la nuit
  ------------------------------------------------------------------

  -- Vendredi 23h30 (heure de Bruxelles) -> soiree du vendredi
  v_tests := v_tests + 1;
  v_resolue := public.resolve_event_night(v_etab, (c_vendredi + time '23:30') at time zone 'Europe/Brussels');
  if v_resolue is distinct from c_vendredi then
    raise exception 'ECHEC test %: 23h30 vendredi devrait donner %, obtenu %.', v_tests, c_vendredi, v_resolue;
  end if;
  raise notice 'OK  %  Vendredi 23h30 -> soiree du vendredi', v_tests;

  -- Samedi 02h00 -> encore la soiree du VENDREDI (le passage de minuit)
  v_tests := v_tests + 1;
  v_resolue := public.resolve_event_night(v_etab, ((c_vendredi + 1) + time '02:00') at time zone 'Europe/Brussels');
  if v_resolue is distinct from c_vendredi then
    raise exception 'ECHEC test %: 02h samedi devrait rester sur %, obtenu %.', v_tests, c_vendredi, v_resolue;
  end if;
  raise notice 'OK  %  Samedi 02h00 -> soiree du vendredi (passage de minuit)', v_tests;

  -- Samedi 07h00 -> apres la fermeture, aucune soiree
  v_tests := v_tests + 1;
  v_resolue := public.resolve_event_night(v_etab, ((c_vendredi + 1) + time '07:00') at time zone 'Europe/Brussels');
  if v_resolue is not null then
    raise exception 'ECHEC test %: 07h samedi devrait etre hors ouverture, obtenu %.', v_tests, v_resolue;
  end if;
  raise notice 'OK  %  Samedi 07h00 -> hors ouverture', v_tests;

  -- Dimanche 17h -> soiree du dimanche (horaire different du vendredi)
  v_tests := v_tests + 1;
  v_resolue := public.resolve_event_night(v_etab, (c_dimanche + time '17:00') at time zone 'Europe/Brussels');
  if v_resolue is distinct from c_dimanche then
    raise exception 'ECHEC test %: 17h dimanche devrait donner %, obtenu %.', v_tests, c_dimanche, v_resolue;
  end if;
  raise notice 'OK  %  Dimanche 17h00 -> soiree du dimanche (horaires par jour)', v_tests;

  -- Mardi 23h -> club ferme
  v_tests := v_tests + 1;
  v_resolue := public.resolve_event_night(v_etab, ((c_vendredi + 4) + time '23:00') at time zone 'Europe/Brussels');
  if v_resolue is not null then
    raise exception 'ECHEC test %: mardi devrait etre ferme, obtenu %.', v_tests, v_resolue;
  end if;
  raise notice 'OK  %  Mardi 23h00 -> club ferme, aucune soiree', v_tests;

  ------------------------------------------------------------------
  -- Test : le scan QR cree la soiree automatiquement
  ------------------------------------------------------------------
  v_tests := v_tests + 1;
  insert into public.qr_scans (establishment_id, customer_id, scanned_at)
  values (v_etab, '11111111-1111-4111-8111-111111111111',
          (c_vendredi + time '23:45') at time zone 'Europe/Brussels')
  returning event_id into v_event_id;

  if v_event_id is null then
    raise exception 'ECHEC test %: le scan n''a cree aucune soiree.', v_tests;
  end if;
  v_event_vendredi := v_event_id;

  select count(*) into v_count from public.events
  where id = v_event_vendredi and establishment_id = v_etab and event_date = c_vendredi;
  if v_count <> 1 then
    raise exception 'ECHEC test %: la soiree creee n''a pas la date attendue.', v_tests;
  end if;
  raise notice 'OK  %  Le premier scan cree la soiree du vendredi', v_tests;

  ------------------------------------------------------------------
  -- Test : un second scan a 02h rejoint la MEME soiree
  ------------------------------------------------------------------
  v_tests := v_tests + 1;
  insert into public.qr_scans (establishment_id, customer_id, scanned_at)
  values (v_etab, '22222222-2222-4222-8222-222222222222',
          ((c_vendredi + 1) + time '02:15') at time zone 'Europe/Brussels')
  returning event_id into v_event_id;

  if v_event_id is distinct from v_event_vendredi then
    raise exception 'ECHEC test %: le scan de 02h a cree une nouvelle soiree au lieu de rejoindre la precedente.', v_tests;
  end if;
  raise notice 'OK  %  Un scan a 02h rejoint la soiree de la veille', v_tests;

  ------------------------------------------------------------------
  -- Test : anti-doublon, un client ne compte qu'une fois par soiree
  ------------------------------------------------------------------
  v_tests := v_tests + 1;
  begin
    insert into public.qr_scans (establishment_id, customer_id, scanned_at)
    values (v_etab, '11111111-1111-4111-8111-111111111111',
            ((c_vendredi + 1) + time '03:00') at time zone 'Europe/Brussels');
    raise exception 'ECHEC test %: le doublon de scan aurait du etre refuse.', v_tests;
  exception
    when unique_violation then
      raise notice 'OK  %  Un client ne peut pas etre compte deux fois la meme soiree', v_tests;
  end;

  ------------------------------------------------------------------
  -- Test : une publication se rattache a la soiree
  ------------------------------------------------------------------
  v_tests := v_tests + 1;
  insert into public.submissions (establishment_id, customer_id, platform, content_type, url,
                                  views_count, points_awarded, status, source, submitted_at)
  values (v_etab, '11111111-1111-4111-8111-111111111111', 'instagram', 'story',
          'https://instagram.com/stories/zz-test/1', 0, 0, 'pending', 'customer_qr',
          ((c_vendredi + 1) + time '01:30') at time zone 'Europe/Brussels')
  returning event_id into v_event_id;

  if v_event_id is distinct from v_event_vendredi then
    raise exception 'ECHEC test %: la publication de 01h30 n''est pas rattachee a la soiree du vendredi.', v_tests;
  end if;
  raise notice 'OK  %  Une story publiee a 01h30 est rattachee a la soiree du vendredi', v_tests;

  ------------------------------------------------------------------
  -- Test : une publication hors ouverture n'est rattachee a rien
  ------------------------------------------------------------------
  v_tests := v_tests + 1;
  insert into public.submissions (establishment_id, customer_id, platform, content_type, url,
                                  views_count, points_awarded, status, source, submitted_at)
  values (v_etab, '33333333-3333-4333-8333-333333333333', 'tiktok', 'video',
          'https://tiktok.com/@zz-test/video/1', 0, 0, 'pending', 'customer_qr',
          ((c_vendredi + 4) + time '23:00') at time zone 'Europe/Brussels')
  returning event_id into v_event_id;

  if v_event_id is not null then
    raise exception 'ECHEC test %: une publication un mardi ne devrait etre rattachee a aucune soiree.', v_tests;
  end if;
  raise notice 'OK  %  Une publication hors ouverture n''est rattachee a aucune soiree', v_tests;

  ------------------------------------------------------------------
  -- Test : une reclamation de recompense se rattache aussi
  ------------------------------------------------------------------
  v_tests := v_tests + 1;
  insert into public.reward_redemptions (reward_id, customer_id, redeemed_at, status)
  values (v_reward, '11111111-1111-4111-8111-111111111111',
          ((c_vendredi + 1) + time '00:45') at time zone 'Europe/Brussels', 'claimed')
  returning event_id into v_event_id;

  if v_event_id is distinct from v_event_vendredi then
    raise exception 'ECHEC test %: la reclamation n''est pas rattachee a la soiree du vendredi.', v_tests;
  end if;
  raise notice 'OK  %  Une recompense reclamee a 00h45 est rattachee a la bonne soiree', v_tests;

  ------------------------------------------------------------------
  -- Test : la resolution par code public fonctionne
  ------------------------------------------------------------------
  v_tests := v_tests + 1;
  select count(*) into v_count
  from public.establishment_by_public_code(
    (select public_code from public.establishments where id = v_etab)
  );
  if v_count <> 1 then
    raise exception 'ECHEC test %: le code public ne resout pas l''etablissement.', v_tests;
  end if;
  raise notice 'OK  %  Le QR code resout bien l''etablissement', v_tests;

  ------------------------------------------------------------------
  -- Test : pre-creation des soirees a venir
  ------------------------------------------------------------------
  v_tests := v_tests + 1;
  perform public.precreate_upcoming_events(14);
  select count(*) into v_count
  from public.events e
  where e.establishment_id = v_etab
    and e.event_date > current_date
    and extract(dow from e.event_date)::smallint in (5, 0);
  if v_count = 0 then
    raise exception 'ECHEC test %: aucune soiree a venir n''a ete pre-creee.', v_tests;
  end if;
  raise notice 'OK  %  % soiree(s) a venir pre-creee(s) sur les jours d''ouverture', v_tests, v_count;

  raise notice '';
  raise notice '=========================================';
  raise notice ' TOUS LES TESTS SONT PASSES (% tests)', v_tests;
  raise notice ' La collecte fonctionne sur ta base.';
  raise notice '=========================================';
end;
$$;

-- Rien n'est conserve : la base retrouve exactement son etat d'avant.
rollback;
