import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';
test('Postgres: waiting word answers update original counters, recent results and wrong-only scope atomically',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE));const db=new PGlite();
 const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;`);
  const read=n=>readFile(new URL('../supabase/migrations/'+n,import.meta.url),'utf8');
  await db.exec((await read('202608200001_initial_schema.sql')).split('insert into storage.buckets')[0].replace('create extension if not exists pgcrypto;',''));
  await db.exec(await read('202608230002_document_folders.sql'));await db.exec(await read('202610050001_vocabulary_collections.sql'));await db.exec(await read('202610200002_generation_word_results.sql'));await db.exec(await read('202610200002_generation_word_results.sql'));
  await db.exec(`grant usage on schema public to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;insert into auth.users values('${user}'),('${other}');set role authenticated;set request.jwt.claim.sub='${user}';`);
  const doc=(await db.query("insert into documents(user_id,title,original_text,analysis) values($1,'Original','Text','{}') returning id",[user])).rows[0].id;
  const word=(await db.query("insert into vocabulary(user_id,document_id,sentence_id,word,meaning,source_sentence,translation) values($1,$2,1,'example','예','An example.','예시') returning id",[user,doc])).rows[0].id;
  await db.query('insert into study_progress(user_id,document_id,sentence_notes) values($1,$2,$3)',[user,doc,JSON.stringify({personal:'keep',__moonwords_study_sets_v1:JSON.stringify({setSize:7,starred:['word:'+word],important:['word:'+word]})})]);
  const answer=async correct=>(await db.query('select record_generation_word_answer($1,$2) as r',[word,correct])).rows[0].r;
  let result=await answer(false);assert.equal(result.word.incorrect_count,1);assert.equal(result.word.review_count,1);let notes=result.progress.sentence_notes;assert.equal(notes.personal,'keep');let settings=JSON.parse(notes.__moonwords_study_sets_v1);assert.deepEqual(settings.incorrect,['word:'+word]);assert.equal(settings.setSize,7);assert.equal(settings.important.length,1);
  result=await answer(true);assert.equal(result.word.correct_count,1);assert.equal(result.word.review_count,2);assert.deepEqual(JSON.parse(result.progress.sentence_notes.__moonwords_study_sets_v1).incorrect,[]);assert.deepEqual(JSON.parse(result.progress.sentence_notes.__moonwords_word_quiz_recent_v1)[word],[false,true]);
  for(let i=0;i<11;i++)result=await answer(i%2===0);assert.equal(JSON.parse(result.progress.sentence_notes.__moonwords_word_quiz_recent_v1)[word].length,10);assert.equal(result.word.review_count,13);
  await db.exec(`set request.jwt.claim.sub='${other}';`);await assert.rejects(answer(true));
 }finally{await db.close();}
});
