-- Persist a per-user folder order and update the whole order atomically.
alter table public.document_folders
  add column if not exists sort_order integer;

with ranked as (
  select
    id,
    row_number() over (partition by user_id order by created_at asc, id asc) - 1 as position
  from public.document_folders
)
update public.document_folders as folder
set sort_order = ranked.position
from ranked
where folder.id = ranked.id
  and folder.sort_order is null;

alter table public.document_folders
  alter column sort_order set default 0;
alter table public.document_folders
  alter column sort_order set not null;

create index if not exists document_folders_user_sort_idx
  on public.document_folders(user_id, sort_order asc, created_at asc);

create or replace function public.reorder_document_folders(ordered_folder_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  owned_count integer;
  supplied_count integer := coalesce(cardinality(ordered_folder_ids), 0);
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select count(*) into owned_count
  from public.document_folders
  where user_id = auth.uid();

  if supplied_count <> owned_count then
    raise exception 'The folder order must contain every owned folder exactly once';
  end if;

  if supplied_count <> (
    select count(distinct folder_id)
    from unnest(coalesce(ordered_folder_ids, '{}'::uuid[])) as supplied(folder_id)
  ) then
    raise exception 'The folder order contains duplicate folder ids';
  end if;

  if exists (
    select 1
    from unnest(coalesce(ordered_folder_ids, '{}'::uuid[])) as supplied(folder_id)
    left join public.document_folders as folder on folder.id = supplied.folder_id
    where folder.id is null or folder.user_id <> auth.uid()
  ) then
    raise exception 'The folder order contains an unavailable folder' using errcode = '42501';
  end if;

  update public.document_folders as folder
  set
    sort_order = (supplied.position - 1)::integer,
    updated_at = now()
  from unnest(ordered_folder_ids) with ordinality as supplied(folder_id, position)
  where folder.id = supplied.folder_id
    and folder.user_id = auth.uid();
end;
$$;

revoke all on function public.reorder_document_folders(uuid[]) from public;
grant execute on function public.reorder_document_folders(uuid[]) to authenticated;

notify pgrst, 'reload schema';
