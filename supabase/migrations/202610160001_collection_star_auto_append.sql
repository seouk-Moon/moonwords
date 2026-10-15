-- Run once in the Supabase SQL Editor. Re-running is safe.
-- SECURITY INVOKER preserves ownership checks and the existing RLS policies.
create or replace function public.moonwords_append_starred_word(p_collection_id uuid, p_source_word_id uuid)
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
 if not coalesce(source_settings->'starred' ? ('word:'||source.id),false) then return 0; end if;
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
 if stars ? ('word:'||copied.id) then return case when inserted then 1 else 0 end; end if;
 stars := stars||jsonb_build_array('word:'||copied.id);
 if inserted and coalesce(source_settings->'important' ? ('word:'||source.id),false) and not important ? ('word:'||copied.id) then
  important := important||jsonb_build_array('word:'||copied.id);
 end if;
 settings := settings||jsonb_build_object('starred',stars,'important',important);
 update public.study_progress set sentence_notes=coalesce(notes,'{}'::jsonb)||jsonb_build_object('__moonwords_study_sets_v1',settings::text)
 where user_id=owner_id and document_id=target.id;
 return case when inserted then 1 else 0 end;
end $$;
revoke all on function public.moonwords_append_starred_word(uuid,uuid) from public,anon;
grant execute on function public.moonwords_append_starred_word(uuid,uuid) to authenticated;

-- New stars immediately append words to every collection containing that source.
create or replace function public.moonwords_propagate_new_stars()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare old_stars jsonb := '[]'::jsonb; new_stars jsonb; source_id uuid; target_id uuid;
begin
 if auth.uid() is null or new.user_id<>auth.uid() then return new; end if;
 if tg_op='UPDATE' then old_stars := public.moonwords_parse_study_settings(old.sentence_notes)->'starred'; end if;
 new_stars := public.moonwords_parse_study_settings(new.sentence_notes)->'starred';
 if jsonb_typeof(old_stars) is distinct from 'array' then old_stars := '[]'::jsonb; end if;
 if jsonb_typeof(new_stars) is distinct from 'array' then return new; end if;
 for source_id in select id from public.vocabulary
  where document_id=new.document_id and user_id=new.user_id
  and new_stars ? ('word:'||id) and not old_stars ? ('word:'||id)
 loop
  for target_id in select id from public.documents
   where user_id=new.user_id and id<>new.document_id
   and coalesce(analysis->'collection'->'sourceDocumentIds','[]'::jsonb) ? new.document_id::text
   order by id
  loop
   perform public.moonwords_append_starred_word(target_id,source_id);
  end loop;
 end loop;
 return new;
end $$;
revoke all on function public.moonwords_propagate_new_stars() from public,anon;
drop trigger if exists moonwords_collection_star_append on public.study_progress;
create trigger moonwords_collection_star_append after insert or update of sentence_notes on public.study_progress
for each row execute function public.moonwords_propagate_new_stars();

-- Catch up existing collections and return fresh analysis before opening a quiz.
create or replace function public.sync_vocabulary_collection_stars(p_collection_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare target public.documents; source_id uuid; result integer; added integer:=0; skipped integer:=0;
begin
 if auth.uid() is null then raise exception '로그인 후 사용할 수 있어요.'; end if;
 select * into target from public.documents where id=p_collection_id and user_id=auth.uid() and analysis ? 'collection' for update;
 if not found then raise exception '통합 단어장을 찾지 못했어요.'; end if;
 for source_id in select v.id from public.vocabulary v
  join public.documents d on d.id=v.document_id and d.user_id=auth.uid()
  join public.study_progress p on p.document_id=v.document_id and p.user_id=auth.uid()
  where v.user_id=auth.uid() and v.document_id<>target.id
  and coalesce(target.analysis->'collection'->'sourceDocumentIds','[]'::jsonb) ? v.document_id::text
  and coalesce(public.moonwords_parse_study_settings(p.sentence_notes)->'starred' ? ('word:'||v.id),false)
  order by v.created_at,v.id
 loop
  result := public.moonwords_append_starred_word(target.id,source_id);
  if result=1 then added:=added+1; elsif result=-1 then skipped:=skipped+1; end if;
 end loop;
 select * into target from public.documents where id=target.id and user_id=auth.uid();
 return jsonb_build_object('document',to_jsonb(target),'addedCount',added,'skippedCount',skipped);
end $$;
revoke all on function public.sync_vocabulary_collection_stars(uuid) from public,anon;
grant execute on function public.sync_vocabulary_collection_stars(uuid) to authenticated;
notify pgrst,'reload schema';
