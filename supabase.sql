-- Blocklands: always-on servers. Run this once in Supabase → SQL Editor → New query → Run.
-- It is safe to run again.

create table if not exists public.bl_servers (
  code       text primary key check (code ~ '^[A-Z2-9]{6}$'),
  name       text not null default '' check (length(name) <= 24),
  mode       text not null default 'survival' check (mode in ('survival', 'creative')),
  created_at timestamptz not null default now()
);

create sequence if not exists public.bl_rev;

create table if not exists public.bl_blocks (
  server text     not null references public.bl_servers (code) on delete cascade,
  x      integer  not null check (abs(x) < 300000),
  y      smallint not null check (y between 0 and 127),
  z      integer  not null check (abs(z) < 300000),
  id     smallint not null check (id between 0 and 4095),
  f      smallint not null default -1 check (f between -1 and 15),
  t      bigint   not null,                                   -- when the player changed it (s)
  rev    bigint   not null default nextval('public.bl_rev'),  -- server order, to fetch what is new
  primary key (server, x, y, z)
);
create index if not exists bl_blocks_rev on public.bl_blocks (server, rev);

-- Newest edit wins; every accepted change gets a new revision number.
create or replace function public.bl_touch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.t < old.t then return null; end if;
  new.rev := nextval('public.bl_rev');
  return new;
end $$;
drop trigger if exists bl_touch on public.bl_blocks;
create trigger bl_touch before update on public.bl_blocks for each row execute function public.bl_touch();

-- The game uses the public anon key: it may read and write blocks, never delete.
alter table public.bl_servers enable row level security;
alter table public.bl_blocks  enable row level security;
drop policy if exists bl_servers_read   on public.bl_servers;
drop policy if exists bl_servers_insert on public.bl_servers;
drop policy if exists bl_blocks_read    on public.bl_blocks;
drop policy if exists bl_blocks_insert  on public.bl_blocks;
drop policy if exists bl_blocks_update  on public.bl_blocks;
create policy bl_servers_read   on public.bl_servers for select to anon using (true);
create policy bl_servers_insert on public.bl_servers for insert to anon with check (true);
create policy bl_blocks_read    on public.bl_blocks  for select to anon using (true);
create policy bl_blocks_insert  on public.bl_blocks  for insert to anon with check (true);
create policy bl_blocks_update  on public.bl_blocks  for update to anon using (true) with check (true);
grant select, insert on public.bl_servers to anon;
grant select, insert, update on public.bl_blocks to anon;
grant usage, select on sequence public.bl_rev to anon;
