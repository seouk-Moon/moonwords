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
