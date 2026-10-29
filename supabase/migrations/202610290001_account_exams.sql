begin;
create table if not exists public.moon_exams (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(char_length(trim(title)) between 1 and 160),
 questions jsonb not null check(jsonb_typeof(questions)='array' and jsonb_array_length(questions) between 1 and 120),
 settings jsonb not null default '{}'::jsonb,
 source_snapshot jsonb not null default '[]'::jsonb,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.moon_exam_sources (
 exam_id uuid not null references public.moon_exams(id) on delete cascade,
 document_id uuid not null references public.documents(id) on delete cascade,
 primary key(exam_id,document_id)
);
alter table public.moon_exams enable row level security;
alter table public.moon_exam_sources enable row level security;
drop policy if exists moon_exams_owner on public.moon_exams;
create policy moon_exams_owner on public.moon_exams for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists moon_exam_sources_owner on public.moon_exam_sources;
create policy moon_exam_sources_owner on public.moon_exam_sources for all to authenticated
using(exists(select 1 from public.moon_exams e where e.id=exam_id and e.user_id=auth.uid()))
with check(exists(select 1 from public.moon_exams e where e.id=exam_id and e.user_id=auth.uid()) and exists(select 1 from public.documents d where d.id=document_id and d.user_id=auth.uid()));
grant select,insert,update,delete on public.moon_exams,public.moon_exam_sources to authenticated;
revoke all on public.moon_exams,public.moon_exam_sources from anon;
create index if not exists moon_exams_owner_updated_idx on public.moon_exams(user_id,updated_at desc);
create index if not exists moon_exam_document_idx on public.moon_exam_sources(document_id);

create or replace function public.save_moon_exam(p_id uuid,p_title text,p_questions jsonb,p_source_ids uuid[],p_settings jsonb default '{}'::jsonb)
returns public.moon_exams language plpgsql security invoker set search_path=public as $$
declare saved public.moon_exams;snapshot jsonb;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
 if p_title is null or char_length(trim(p_title)) not between 1 and 160 then raise exception '시험 제목은 1~160자로 입력해 주세요.';end if;
 if p_questions is null or jsonb_typeof(p_questions)<>'array' then raise exception '저장할 문제가 없습니다.';end if;
 if jsonb_array_length(p_questions) not between 1 and 120 or octet_length(p_questions::text)>2000000 then raise exception '시험 크기가 너무 큽니다.';end if;
 if p_source_ids is null or cardinality(p_source_ids)>5 or array_position(p_source_ids,null) is not null then raise exception '출처 본문을 확인해 주세요.';end if;
 if exists(select 1 from unnest(p_source_ids) s(id) where not exists(select 1 from public.documents d where d.id=s.id and d.user_id=auth.uid())) then raise exception '내 계정의 본문만 연결할 수 있습니다.';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title)),'[]'::jsonb) into snapshot from public.documents where id=any(p_source_ids) and user_id=auth.uid();
 if p_id is null then
  insert into public.moon_exams(user_id,title,questions,settings,source_snapshot) values(auth.uid(),trim(p_title),p_questions,coalesce(p_settings,'{}'),snapshot) returning * into saved;
 else
  select * into saved from public.moon_exams where id=p_id and user_id=auth.uid() for update;
  if not found then raise exception '시험을 찾을 수 없습니다.';end if;
  -- Keep original titles/excerpts available even after a source passage is deleted.
  if snapshot='[]'::jsonb then snapshot=saved.source_snapshot;end if;
  update public.moon_exams set title=trim(p_title),questions=p_questions,settings=coalesce(p_settings,'{}'),source_snapshot=snapshot,updated_at=now() where id=p_id and user_id=auth.uid() returning * into saved;
 end if;
 delete from public.moon_exam_sources where exam_id=saved.id;
 insert into public.moon_exam_sources(exam_id,document_id) select saved.id,id from (select distinct unnest(p_source_ids) id) s;
 return saved;
end;$$;
revoke all on function public.save_moon_exam(uuid,text,jsonb,uuid[],jsonb) from public;
grant execute on function public.save_moon_exam(uuid,text,jsonb,uuid[],jsonb) to authenticated;
create or replace function public.list_moon_exams(p_document_id uuid default null)
returns table(id uuid,title text,updated_at timestamptz,question_count integer,source_snapshot jsonb)
language sql stable security invoker set search_path=public as $$
 select e.id,e.title,e.updated_at,jsonb_array_length(e.questions),e.source_snapshot from public.moon_exams e where e.user_id=auth.uid() and (p_document_id is null or exists(select 1 from public.moon_exam_sources s where s.exam_id=e.id and s.document_id=p_document_id)) order by e.updated_at desc limit 100
$$;
revoke all on function public.list_moon_exams(uuid) from public;
grant execute on function public.list_moon_exams(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
