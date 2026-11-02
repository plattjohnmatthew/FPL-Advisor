begin;
create extension if not exists pgtap with schema extensions;
select plan(12);
select has_table('public','fpl_player_price_snapshots','price snapshots exist');
select has_index('public','fpl_player_price_snapshots','fpl_price_snapshots_player_observed_idx','player history is indexed');
insert into public.fpl_teams(fpl_team_id,name,short_name,updated_at) values (21,'Price Test FC','PTF',now());
insert into public.fpl_players(fpl_player_id,web_name,first_name,second_name,canonical_name,fpl_team_id,position,current_price,status,can_select,can_transact,removed,updated_at)
values (210,'PriceTest','Price','Tester','Price Test Player',21,'MID',7.5,'a',true,true,false,now());
insert into public.sources(id,name,platform,channel_url,external_channel_id) values ('91000000-0000-4000-8000-000000000001','Price Creator','YOUTUBE','https://youtube.test/price','price-source');
insert into public.episodes(id,source_id,external_episode_id,title,source_url,published_at) values ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','price-episode','Price episode','https://youtube.test/watch/price',now());
insert into public.insights(id,episode_id,claim,reasoning,primary_category,recommendation,time_horizon,creator_confidence,extraction_version) values ('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','Buy Saka','Creator considers the player good value.','VALUE_MARKET','BUY','SHORT','HIGH','test');
insert into public.entities(id,type,canonical_name,external_fpl_id) values ('94000000-0000-4000-8000-000000000001','PLAYER','Price Test Player',210);
insert into public.insight_entities(insight_id,entity_id,role) values ('93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','SUBJECT');
insert into public.fpl_sync_runs(id,started_at,completed_at,status,player_count,team_count) values
('95000000-0000-4000-8000-000000000001','2026-08-01', '2026-08-01','COMPLETED',1,1),
('95000000-0000-4000-8000-000000000002','2026-08-08', '2026-08-08','COMPLETED',1,1),
('95000000-0000-4000-8000-000000000003','2026-08-15', '2026-08-15','COMPLETED',1,1),
('95000000-0000-4000-8000-000000000004','2026-08-22', '2026-08-22','COMPLETED',1,1);
insert into public.fpl_player_price_snapshots(fpl_player_id,sync_run_id,price,observed_at,event_id,source) values (210,'95000000-0000-4000-8000-000000000001',7.5,'2026-08-01',1,'OFFICIAL_BOOTSTRAP');
select is((select count(*)::integer from public.fpl_player_price_snapshots),1,'first sync creates one snapshot');
insert into public.fpl_player_price_snapshots(fpl_player_id,sync_run_id,price,observed_at,event_id,source) values (210,'95000000-0000-4000-8000-000000000001',7.5,'2026-08-01',1,'OFFICIAL_BOOTSTRAP') on conflict do nothing;
select is((select count(*)::integer from public.fpl_player_price_snapshots),1,'repeating the same sync is idempotent');
insert into public.fpl_player_price_snapshots(fpl_player_id,sync_run_id,price,observed_at,event_id,source) values
(210,'95000000-0000-4000-8000-000000000002',7.5,'2026-08-08',2,'OFFICIAL_BOOTSTRAP'),
(210,'95000000-0000-4000-8000-000000000003',7.6,'2026-08-15',3,'OFFICIAL_BOOTSTRAP'),
(210,'95000000-0000-4000-8000-000000000004',7.5,'2026-08-22',4,'OFFICIAL_BOOTSTRAP');
select is((select price from public.fpl_player_price_snapshots order by observed_at desc limit 1),7.5::numeric,'latest decrease is stored');
select is((select price from public.fpl_player_price_snapshots order by observed_at desc offset 1 limit 1),7.6::numeric,'previous increased price is retained');
select is((select count(*)::integer from public.fpl_player_price_snapshots),4,'longer history is append-only across syncs');
select is((select count(distinct price)::integer from public.fpl_player_price_snapshots),2,'unchanged and changed observations coexist');
update public.fpl_players set current_price=7.5 where fpl_player_id=210;
select is((select current_price from public.fpl_players where fpl_player_id=210),7.5::numeric,'fast current price remains on player');
select is((select count(*)::integer from public.insights where id='93000000-0000-4000-8000-000000000001'),1,'price history does not alter insights');
select is((select count(*)::integer from public.insight_entities where insight_id='93000000-0000-4000-8000-000000000001'),1,'price history preserves insight entity links');
select throws_ok($$delete from public.fpl_sync_runs where id='95000000-0000-4000-8000-000000000001'$$,'23503','update or delete on table "fpl_sync_runs" violates foreign key constraint "fpl_player_price_snapshots_sync_run_id_fkey" on table "fpl_player_price_snapshots"','snapshot audit cannot be deleted through its sync run');
select * from finish();
rollback;
