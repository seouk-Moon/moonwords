-- Copies source words into an independent document in a single transaction.
-- Existing document/vocabulary/progress RLS remains in force (SECURITY INVOKER).
create or replace function public.moonwords_parse_study_settings(notes jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
begin
 return coalesce((notes->>'__moonwords_study_sets_v1')::jsonb, '{}'::jsonb);
exception when others then return '{}'::jsonb;
end $$;
revoke all on function public.moonwords_parse_study_settings(jsonb) from public, anon;
grant execute on function public.moonwords_parse_study_settings(jsonb) to authenticated;

create or replace function public.create_vocabulary_collection(
 p_title text, p_source_ids uuid[], p_folder_id uuid default null, p_scope text default 'starred'
) returns public.documents language plpgsql security invoker set search_path = '' as $$
declare
 user_id_value uuid := auth.uid(); doc public.documents; w record;
 new_word_id uuid; counter integer := 0; source_ids uuid[];
 sentences jsonb := '[]'::jsonb; stars jsonb := '[]'::jsonb; importance jsonb := '[]'::jsonb;
 original text := ''; settings jsonb;
begin
 if user_id_value is null then raise exception '로그인 후 통합 단어장을 만들 수 있어요.'; end if;
 if coalesce(char_length(btrim(p_title)),0) not between 1 and 160 then raise exception '단어장 이름은 1~160자로 입력해 주세요.'; end if;
 if p_scope is null or p_scope not in ('starred','important','all') then raise exception '잘못된 단어 선택 범위입니다.'; end if;
 select array_agg(distinct id) into source_ids from unnest(p_source_ids) id;
 if coalesce(cardinality(source_ids),0) = 0 or cardinality(source_ids) > 100 then raise exception '본문을 1~100개 선택해 주세요.'; end if;
 if (select count(*) from public.documents where id = any(source_ids) and user_id = user_id_value) <> cardinality(source_ids) then
  raise exception '선택한 본문을 찾지 못했어요. 새로고침해 주세요.';
 end if;
 if p_folder_id is not null and not exists(select 1 from public.document_folders where id=p_folder_id and user_id=user_id_value) then
  raise exception '저장할 폴더를 찾지 못했어요.';
 end if;
 insert into public.documents (user_id,folder_id,title,source_type,original_text,analysis)
 values (user_id_value,p_folder_id,btrim(p_title),'vocabulary_collection','', '{}') returning * into doc;
 for w in
  with marked as (
   select v.*, d.title as source_title,
    coalesce(public.moonwords_parse_study_settings(p.sentence_notes)->'starred' ? ('word:'||v.id), false) as is_starred,
    coalesce(public.moonwords_parse_study_settings(p.sentence_notes)->'important' ? ('word:'||v.id), false) as is_important
   from public.vocabulary v join public.documents d on d.id=v.document_id
   left join public.study_progress p on p.document_id=v.document_id and p.user_id=user_id_value
   where v.document_id=any(source_ids) and v.user_id=user_id_value and d.user_id=user_id_value
  ), selected as (
   select *, lower(regexp_replace(btrim(word), '\s+', ' ', 'g')) as word_key,
    lower(regexp_replace(btrim(meaning), '\s+', ' ', 'g')) as meaning_key
   from marked where p_scope='all' or (p_scope='starred' and is_starred) or (p_scope='important' and is_important)
  ), combined as (
   select *, row_number() over(partition by word_key,meaning_key order by created_at,id) as rank,
    bool_or(is_starred) over(partition by word_key,meaning_key) as inherited_star,
    bool_or(is_important) over(partition by word_key,meaning_key) as inherited_important,
    string_agg(source_title, ', ') over(partition by word_key,meaning_key) as source_titles
   from selected
  ) select * from combined where rank=1 order by created_at,id
 loop
  if counter >= 5000 then raise exception '통합 단어장 하나에 최대 5000개까지 저장할 수 있어요.'; end if;
  new_word_id := gen_random_uuid();
  insert into public.vocabulary (id,user_id,document_id,sentence_id,word,meaning,source_sentence,translation,note)
  values (new_word_id,user_id_value,doc.id,counter,w.word,w.meaning,
   coalesce(nullif(w.source_sentence,''),w.word),w.translation,
   concat_ws(E'\n', nullif(w.note,''),'원본 본문: '||w.source_titles));
  sentences := sentences || jsonb_build_array(jsonb_build_object('id',counter,'paragraph',1,
   'english',coalesce(nullif(w.source_sentence,''),w.word),'korean',w.translation,
   'keywords',jsonb_build_array(jsonb_build_object('word',w.word,'meaning',w.meaning))));
  if w.inherited_star then stars := stars || jsonb_build_array('word:'||new_word_id); end if;
  if w.inherited_important then importance := importance || jsonb_build_array('word:'||new_word_id); end if;
  original := original || case when counter>0 then E'\n\n' else '' end || coalesce(nullif(w.source_sentence,''),w.word);
  counter := counter+1;
 end loop;
 if counter=0 then raise exception '선택한 범위에 저장된 단어가 없어요. 별표 표시나 선택 범위를 확인해 주세요.'; end if;
 update public.documents set original_text=original,analysis=jsonb_build_object(
  'level','B1','topic','통합 단어장','summary',cardinality(source_ids)||'개 본문에서 모은 '||counter||'개 단어',
  'structure','원본 예문으로 복습하는 통합 단어장','sections',jsonb_build_array(jsonb_build_object('id',1,'label','모아둔 단어','role','단어 복습')),
  'sentences',sentences,'questions','[]'::jsonb,
  'collection',jsonb_build_object('sourceDocumentIds',to_jsonb(source_ids),'scope',p_scope,'wordCount',counter)
 ) where id=doc.id returning * into doc;
 settings := jsonb_build_object('setSize',10,'starred',stars,'important',importance,'incorrect','[]'::jsonb);
 insert into public.study_progress(user_id,document_id,sentence_notes)
 values(user_id_value,doc.id,jsonb_build_object('__moonwords_study_sets_v1',settings::text));
 return doc;
end $$;
revoke all on function public.create_vocabulary_collection(text,uuid[],uuid,text) from public,anon;
grant execute on function public.create_vocabulary_collection(text,uuid[],uuid,text) to authenticated;

notify pgrst, 'reload schema';
