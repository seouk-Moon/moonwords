-- Existing folders remain at the top level. No documents are moved by this migration.
alter table public.document_folders add column if not exists parent_id uuid references public.document_folders(id) on delete set null;
create index if not exists document_folders_parent_idx on public.document_folders(user_id,parent_id);

create or replace function public.validate_folder_parent() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.parent_id is null then return new; end if;
  if new.parent_id = new.id then raise exception '폴더를 자기 안으로 이동할 수 없습니다.'; end if;
  if not exists(select 1 from public.document_folders where id=new.parent_id and user_id=new.user_id) then raise exception '이동할 폴더를 찾을 수 없습니다.'; end if;
  if exists(with recursive ancestors as (
    select id,parent_id from public.document_folders where id=new.parent_id
    union select f.id,f.parent_id from public.document_folders f join ancestors a on f.id=a.parent_id
  ) select 1 from ancestors where id=new.id) then raise exception '하위 폴더 안으로 이동할 수 없습니다.'; end if;
  return new;
end;$$;
drop trigger if exists moonwords_validate_folder_parent on public.document_folders;
create trigger moonwords_validate_folder_parent before insert or update of parent_id,user_id on public.document_folders for each row execute function public.validate_folder_parent();

create or replace function public.move_library_folder(p_folder_id uuid,p_parent_id uuid default null)
returns public.document_folders language plpgsql security invoker set search_path=public as $$
declare result public.document_folders;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  -- Serialize moves by owner so simultaneous opposing moves cannot create a loop.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,22));
  if not exists(select 1 from public.document_folders where id=p_folder_id and user_id=auth.uid()) then raise exception '폴더를 찾을 수 없습니다.'; end if;
  update public.document_folders set parent_id=p_parent_id,updated_at=now() where id=p_folder_id and user_id=auth.uid() returning * into result;
  return result;
end;$$;
revoke all on function public.move_library_folder(uuid,uuid) from public;
grant execute on function public.move_library_folder(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
