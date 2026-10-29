begin;
alter table public.moon_drive_files add column if not exists owner_id uuid references auth.users(id) on delete cascade;
create index if not exists moon_drive_owner_idx on public.moon_drive_files(owner_id,created_at desc);
-- Existing rows deliberately remain unassigned. Only a server-configured legacy owner may recover them.
create or replace function public.moon_drive_reserve_owned(file_id uuid,file_name text,file_size bigint,capacity bigint,p_owner_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_owner_id is null or not exists(select 1 from auth.users where id=p_owner_id) then raise exception 'Invalid owner';end if;
 perform pg_advisory_xact_lock(610040001);
 if (select count(*) from public.moon_drive_files)>=500 then raise exception 'Drive file count exceeded';end if;
 if capacity<1 or capacity>524288000 then raise exception 'Invalid capacity';end if;
 if (select coalesce(sum(size),0) from public.moon_drive_files)+file_size>capacity then raise exception 'Drive capacity exceeded';end if;
 insert into public.moon_drive_files(id,name,size,owner_id) values(file_id,file_name,file_size,p_owner_id);
end;$$;
revoke all on function public.moon_drive_reserve_owned(uuid,text,bigint,bigint,uuid) from public,anon,authenticated;
grant execute on function public.moon_drive_reserve_owned(uuid,text,bigint,bigint,uuid) to service_role;
notify pgrst,'reload schema';
commit;
