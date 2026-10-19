-- Run as the database owner in Supabase SQL Editor. No service key in the browser.
create table if not exists public.moonwords_session_devices (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_name text not null,
  last_seen_at timestamptz not null default now()
);
alter table public.moonwords_session_devices enable row level security;
revoke all on public.moonwords_session_devices from public, anon, authenticated;

-- Never trust a user/session ID supplied by a browser. Validate the signed JWT
-- against a live Auth session on every operation (including revoke operations).
create or replace function public.moonwords_live_session_id()
returns uuid language sql security definer set search_path = '' as $$
  select s.id from auth.sessions s
  where s.id = nullif(auth.jwt()->>'session_id', '')::uuid
    and s.user_id = auth.uid()
  for update;
$$;
revoke all on function public.moonwords_live_session_id() from public, anon, authenticated;

create or replace function public.moonwords_touch_session(p_device_name text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_id uuid := public.moonwords_live_session_id();
begin
  if v_id is null then return false; end if;
  insert into public.moonwords_session_devices(session_id, user_id, device_name, last_seen_at)
  values(v_id, auth.uid(), coalesce(nullif(left(trim(p_device_name), 100), ''), '기기 정보 없음'), now())
  on conflict(session_id) do update set last_seen_at = now(), device_name = excluded.device_name;
  return true;
end;
$$;

create or replace function public.moonwords_list_sessions()
returns table(session_id uuid, device_name text, created_at timestamptz, last_seen_at timestamptz, is_current boolean)
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := public.moonwords_live_session_id();
begin
  if v_id is null then raise exception '로그인이 만료되었습니다. 다시 로그인해 주세요.' using errcode = '28000'; end if;
  return query select s.id, coalesce(d.device_name, '이전 로그인 · 기기 정보 없음'),
    s.created_at, coalesce(d.last_seen_at, s.updated_at, s.created_at), s.id = v_id
  from auth.sessions s left join public.moonwords_session_devices d on d.session_id = s.id
  where s.user_id = auth.uid()
  order by (s.id = v_id) desc, coalesce(d.last_seen_at, s.updated_at, s.created_at) desc;
end;
$$;

-- p_session_id = NULL revokes all sessions belonging to the caller.
create or replace function public.moonwords_revoke_sessions(p_session_id uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_id uuid := public.moonwords_live_session_id(); v_count integer;
begin
  if v_id is null then raise exception '로그인이 만료되었습니다. 다시 로그인해 주세요.' using errcode = '28000'; end if;
  -- Explicitly remove refresh tokens; do not depend on Auth FK cascade details.
  delete from auth.refresh_tokens r using auth.sessions s
  where r.session_id = s.id and s.user_id = auth.uid()
    and (p_session_id is null or s.id = p_session_id);
  delete from auth.sessions s where s.user_id = auth.uid()
    and (p_session_id is null or s.id = p_session_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.moonwords_touch_session(text) from public, anon;
revoke all on function public.moonwords_list_sessions() from public, anon;
revoke all on function public.moonwords_revoke_sessions(uuid) from public, anon;
grant execute on function public.moonwords_touch_session(text) to authenticated;
grant execute on function public.moonwords_list_sessions() to authenticated;
grant execute on function public.moonwords_revoke_sessions(uuid) to authenticated;
notify pgrst, 'reload schema';
