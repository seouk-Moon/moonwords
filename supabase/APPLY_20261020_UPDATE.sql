-- MoonWords 2026-10-20 cumulative update. Run the whole file once.
-- Includes collection selection and generation-waiting vocabulary results.
begin;

-- Run AFTER the existing vocabulary collection migrations. Safe to run again.
-- New words require an explicit selection. Existing words are never deleted.
drop trigger if exists moonwords_collection_star_append on public.study_progress;

-- Older clients must also stop auto-appending when opening a collection.
create or replace function public.sync_vocabulary_collection_stars(p_collection_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare target public.documents;
begin
 select * into target from public.documents where id=p_collection_id and user_id=auth.uid() and analysis ? 'collection';
 if not found then raise exception '통합 단어장을 찾지 못했어요.'; end if;
 return jsonb_build_object('document',to_jsonb(target),'addedCount',0,'skippedCount',0);
end $$;

create or replace function public.moonwords_import_collection_word(p_collection_id uuid, p_source_word_id uuid)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
 owner_id uuid := auth.uid(); target public.documents; source public.vocabulary;
 copied public.vocabulary; source_title text; source_settings jsonb;
 notes jsonb; settings jsonb; stars jsonb; important jsonb;
 next_sentence integer; total integer; inserted boolean := false; source_line text;
begin
 if owner_id is null then raise exception '로그인 후 사용할 수 있어요.'; end if;
 select * into target from public.documents
 where id=p_collection_id and user_id=owner_id and analysis ? 'collection' for update;
 if not found then raise exception '통합 단어장을 찾지 못했어요.'; end if;
 select v.* into source from public.vocabulary v
 join public.documents d on d.id=v.document_id and d.user_id=owner_id
 where v.id=p_source_word_id and v.user_id=owner_id and v.document_id<>target.id
 and coalesce(target.analysis->'collection'->'sourceDocumentIds','[]'::jsonb) ? v.document_id::text;
 if not found then raise exception '통합 단어장에 포함된 원본 단어가 아닙니다.'; end if;
 select public.moonwords_parse_study_settings(sentence_notes) into source_settings
 from public.study_progress where user_id=owner_id and document_id=source.document_id;

 select title into source_title from public.documents where id=source.document_id and user_id=owner_id;
 source_line := '원본 본문: '||source_title;
 select * into copied from public.vocabulary where document_id=target.id and user_id=owner_id
 and lower(regexp_replace(btrim(word),'\s+',' ','g'))=lower(regexp_replace(btrim(source.word),'\s+',' ','g'))
 and lower(regexp_replace(btrim(meaning),'\s+',' ','g'))=lower(regexp_replace(btrim(source.meaning),'\s+',' ','g'))
 order by created_at,id limit 1;
 if not found then
  select count(*) into total from public.vocabulary where document_id=target.id and user_id=owner_id;
  if total>=5000 then return -1; end if;
  select greatest(
   coalesce((select max(sentence_id) from public.vocabulary where document_id=target.id and user_id=owner_id),-1),
   coalesce((select max(case when item->>'id' ~ '^[0-9]{1,9}$' then (item->>'id')::integer end)
    from jsonb_array_elements(coalesce(target.analysis->'sentences','[]'::jsonb)) item),-1)
  )+1 into next_sentence;
  insert into public.vocabulary(user_id,document_id,sentence_id,word,meaning,source_sentence,translation,note)
  values(owner_id,target.id,next_sentence,source.word,source.meaning,source.source_sentence,source.translation,
   concat_ws(E'\n',nullif(source.note,''),source_line)) returning * into copied;
  update public.documents set
   original_text=concat_ws(E'\n\n',nullif(original_text,''),coalesce(nullif(source.source_sentence,''),source.word)),
   analysis=jsonb_set(jsonb_set(analysis,'{sentences}',coalesce(analysis->'sentences','[]'::jsonb)||jsonb_build_array(jsonb_build_object(
    'id',next_sentence,'paragraph',1,'english',coalesce(nullif(source.source_sentence,''),source.word),
    'korean',source.translation,'keywords',jsonb_build_array(jsonb_build_object('word',source.word,'meaning',source.meaning))
   ))),'{collection,wordCount}',to_jsonb(total+1))
  where id=target.id and user_id=owner_id;
  inserted := true;
 elsif strpos(E'\n'||copied.note||E'\n',E'\n'||source_line||E'\n')=0 then
  update public.vocabulary set note=concat_ws(E'\n',nullif(note,''),source_line) where id=copied.id and user_id=owner_id;
 end if;
 insert into public.study_progress(user_id,document_id) values(owner_id,target.id)
 on conflict(user_id,document_id) do nothing;
 select sentence_notes into notes from public.study_progress where user_id=owner_id and document_id=target.id for update;
 settings := public.moonwords_parse_study_settings(notes);
 if jsonb_typeof(settings) is distinct from 'object' then settings := '{}'::jsonb; end if;
 stars := case when jsonb_typeof(settings->'starred')='array' then settings->'starred' else '[]'::jsonb end;
 important := case when jsonb_typeof(settings->'important')='array' then settings->'important' else '[]'::jsonb end;
 if coalesce(source_settings->'starred' ? ('word:'||source.id),false) and not stars ? ('word:'||copied.id) then
  stars := stars||jsonb_build_array('word:'||copied.id);
 end if;
 if inserted and coalesce(source_settings->'important' ? ('word:'||source.id),false) and not important ? ('word:'||copied.id) then
  important := important||jsonb_build_array('word:'||copied.id);
 end if;
 settings := settings||jsonb_build_object('starred',stars,'important',important);
 update public.study_progress set sentence_notes=coalesce(notes,'{}'::jsonb)||jsonb_build_object('__moonwords_study_sets_v1',settings::text)
 where user_id=owner_id and document_id=target.id;
 return case when inserted then 1 else 0 end;
end $$;
revoke all on function public.moonwords_import_collection_word(uuid,uuid) from public,anon;
grant execute on function public.moonwords_import_collection_word(uuid,uuid) to authenticated;


create or replace function public.list_vocabulary_collection_updates(p_collection_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare target public.documents; result jsonb;
begin
 if auth.uid() is null then raise exception '로그인 후 사용할 수 있어요.'; end if;
 select * into target from public.documents where id=p_collection_id and user_id=auth.uid() and analysis ? 'collection';
 if not found then raise exception '통합 단어장을 찾지 못했어요.'; end if;
 with available as (
  select v.*,d.title as source_title,
   lower(regexp_replace(btrim(v.word),'\s+',' ','g')) as wk,
   lower(regexp_replace(btrim(v.meaning),'\s+',' ','g')) as mk
  from public.vocabulary v join public.documents d on d.id=v.document_id and d.user_id=auth.uid()
  where v.user_id=auth.uid() and v.document_id<>target.id and v.created_at>target.created_at
  and coalesce(target.analysis->'collection'->'sourceDocumentIds','[]'::jsonb) ? v.document_id::text
  and not exists(select 1 from public.vocabulary existing where existing.document_id=target.id and existing.user_id=auth.uid()
   and lower(regexp_replace(btrim(existing.word),'\s+',' ','g'))=lower(regexp_replace(btrim(v.word),'\s+',' ','g'))
   and lower(regexp_replace(btrim(existing.meaning),'\s+',' ','g'))=lower(regexp_replace(btrim(v.meaning),'\s+',' ','g')))
 ), grouped as (
  select *,row_number() over(partition by wk,mk order by created_at,id) as rank,
   string_agg(source_title, ', ') over(partition by wk,mk) as source_titles from available
 ), candidates as (select * from grouped where rank=1), page as (select * from candidates order by created_at,id limit 500)
 select jsonb_build_object('totalCount',(select count(*) from candidates),'candidates',coalesce((select jsonb_agg(jsonb_build_object(
  'id',id,'word',word,'meaning',meaning,'source_sentence',source_sentence,'translation',translation,'source_title',source_titles
 ) order by created_at,id) from page),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.list_vocabulary_collection_updates(uuid) from public,anon;
grant execute on function public.list_vocabulary_collection_updates(uuid) to authenticated;

create or replace function public.import_vocabulary_collection_updates(p_collection_id uuid,p_word_ids uuid[])
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare target public.documents; selected_id uuid; result integer; added integer:=0; skipped integer:=0;
begin
 if auth.uid() is null then raise exception '로그인 후 사용할 수 있어요.'; end if;
 if coalesce(cardinality(p_word_ids),0) not between 1 and 500 then raise exception '추가할 단어를 1~500개 선택해 주세요.'; end if;
 select * into target from public.documents where id=p_collection_id and user_id=auth.uid() and analysis ? 'collection' for update;
 if not found then raise exception '통합 단어장을 찾지 못했어요.'; end if;
 -- Reject foreign, removed or unrelated source words atomically before any insertion.
 if exists(select 1 from unnest(p_word_ids) requested(id) where not exists(
  select 1 from public.vocabulary v join public.documents d on d.id=v.document_id and d.user_id=auth.uid()
  where v.id=requested.id and v.user_id=auth.uid() and v.document_id<>target.id and v.created_at>target.created_at
  and coalesce(target.analysis->'collection'->'sourceDocumentIds','[]'::jsonb) ? v.document_id::text
 )) then raise exception '원본 단어가 변경되었어요. 추가된 단어를 다시 확인해 주세요.'; end if;
 for selected_id in select distinct id from unnest(p_word_ids) selected(id) order by id loop
  result := public.moonwords_import_collection_word(target.id,selected_id);
  if result=1 then added:=added+1; elsif result=-1 then skipped:=skipped+1; end if;
 end loop;
 select * into target from public.documents where id=p_collection_id and user_id=auth.uid();
 return jsonb_build_object('document',to_jsonb(target),'addedCount',added,'skippedCount',skipped);
end $$;
revoke all on function public.import_vocabulary_collection_updates(uuid,uuid[]) from public,anon;
grant execute on function public.import_vocabulary_collection_updates(uuid,uuid[]) to authenticated;
notify pgrst,'reload schema';

-- Store waiting-quiz results against the ORIGINAL word/document atomically.
create or replace function public.record_generation_word_answer(p_word_id uuid,p_correct boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare item public.vocabulary; progress public.study_progress; settings jsonb; incorrect jsonb; recent jsonb; results jsonb; notes jsonb;
begin
 if auth.uid() is null or p_correct is null then raise exception '로그인과 정오답 정보가 필요합니다.'; end if;
 select * into item from public.vocabulary where id=p_word_id and user_id=auth.uid() for update;
 if not found then raise exception '원본 단어를 찾지 못했어요.'; end if;
 update public.vocabulary set review_count=review_count+1,correct_count=correct_count+case when p_correct then 1 else 0 end,
 incorrect_count=incorrect_count+case when p_correct then 0 else 1 end where id=item.id returning * into item;
 insert into public.study_progress(user_id,document_id) values(auth.uid(),item.document_id) on conflict(user_id,document_id) do nothing;
 select * into progress from public.study_progress where user_id=auth.uid() and document_id=item.document_id for update;
 notes:=coalesce(progress.sentence_notes,'{}'::jsonb);
 settings:=public.moonwords_parse_study_settings(notes);
 if jsonb_typeof(settings) is distinct from 'object' then settings:='{}'::jsonb; end if;
 incorrect:=case when jsonb_typeof(settings->'incorrect')='array' then settings->'incorrect' else '[]'::jsonb end;
 if p_correct then incorrect:=incorrect-('word:'||item.id);
 elsif not incorrect ? ('word:'||item.id) then incorrect:=incorrect||jsonb_build_array('word:'||item.id); end if;
 settings:=settings||jsonb_build_object('incorrect',incorrect);
 begin recent:=(notes->>'__moonwords_word_quiz_recent_v1')::jsonb; exception when others then recent:='{}'::jsonb; end;
 if jsonb_typeof(recent) is distinct from 'object' then recent:='{}'::jsonb; end if;
 results:=case when jsonb_typeof(recent->item.id::text)='array' then recent->item.id::text else '[]'::jsonb end;
 results:=results||jsonb_build_array(p_correct);
 while jsonb_array_length(results)>10 loop results:=results-0;end loop;
 recent:=jsonb_set(recent,array[item.id::text],results);
 notes:=notes||jsonb_build_object('__moonwords_study_sets_v1',settings::text,'__moonwords_word_quiz_recent_v1',recent::text);
 update public.study_progress set sentence_notes=notes,last_studied_at=now() where id=progress.id returning * into progress;
 return jsonb_build_object('word',to_jsonb(item),'progress',to_jsonb(progress));
end $$;
revoke all on function public.record_generation_word_answer(uuid,boolean) from public,anon;
grant execute on function public.record_generation_word_answer(uuid,boolean) to authenticated;
notify pgrst,'reload schema';

commit;
