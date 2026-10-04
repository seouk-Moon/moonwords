-- Private shared drive. All operations go through moon-drive with a server-side code.
insert into storage.buckets (id, name, public, file_size_limit)
values ('moon-drive', 'moon-drive', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = 20971520;
-- A restrictive policy also blocks accidentally broad existing client policies.
create policy moon_drive_server_only on storage.objects as restrictive
for all to anon, authenticated
using (bucket_id <> 'moon-drive') with check (bucket_id <> 'moon-drive');

create table public.moon_drive_files (
 id uuid primary key,
 name text not null check (char_length(name) between 1 and 200),
 size bigint not null check (size between 1 and 20971520),
 ready boolean not null default false,
 created_at timestamptz not null default now()
);
alter table public.moon_drive_files enable row level security;
revoke all on public.moon_drive_files from anon, authenticated;
grant all on public.moon_drive_files to service_role;

create table public.moon_drive_gate (
 id integer primary key check (id = 1), failures integer not null default 0,
 window_start timestamptz not null default now()
);
insert into public.moon_drive_gate (id) values (1);
alter table public.moon_drive_gate enable row level security;
revoke all on public.moon_drive_gate from anon, authenticated;

-- Global failure budget: protects a six-digit secret even across rotating IPs.
create function public.moon_drive_check_gate(valid boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare g public.moon_drive_gate;
begin
 select * into g from public.moon_drive_gate where id = 1 for update;
 if now() >= g.window_start + interval '10 minutes' then
  update public.moon_drive_gate set failures = 0, window_start = now() where id = 1;
  g.failures := 0;
 end if;
 if g.failures >= 20 then return false; end if;
 if not valid then update public.moon_drive_gate set failures = failures + 1 where id = 1; end if;
 return true;
end $$;

-- Reserve space before upload; concurrent requests cannot exceed capacity.
create function public.moon_drive_reserve(file_id uuid, file_name text, file_size bigint, capacity bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
 perform pg_advisory_xact_lock(610040001);
 if (select count(*) from public.moon_drive_files) >= 500 then
  raise exception 'Drive file count exceeded';
 end if;
 if capacity < 1 or capacity > 524288000 then raise exception 'Invalid capacity'; end if;
 if (select coalesce(sum(size), 0) from public.moon_drive_files) + file_size > capacity then
  raise exception 'Drive capacity exceeded';
 end if;
 insert into public.moon_drive_files (id, name, size) values (file_id, file_name, file_size);
end $$;
revoke all on function public.moon_drive_check_gate(boolean) from public, anon, authenticated;
revoke all on function public.moon_drive_reserve(uuid, text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.moon_drive_check_gate(boolean) to service_role;
grant execute on function public.moon_drive_reserve(uuid, text, bigint, bigint) to service_role;
