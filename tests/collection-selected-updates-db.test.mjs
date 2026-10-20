import test from 'node:test';import {pathToFileURL,fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('..',import.meta.url));
const uid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const source='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',foreign='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const w1='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',w2='ffffffff-ffff-4fff-8fff-ffffffffffff';
test('Postgres: collection updates require selection and preserve ownership, dedup and marks',{skip:!process.env.PGLITE_MODULE},async()=>{
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE));const db=new PGlite();
try{
await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select current_setting('app.uid',true)::uuid $$;insert into auth.users values('${uid}'),('${other}');`);
let initial=await readFile(root+'/supabase/migrations/202608200001_initial_schema.sql','utf8');await db.exec(initial.slice(initial.indexOf('create table'),initial.indexOf('insert into storage.buckets')));
await db.exec(`create table public.document_folders(id uuid primary key,user_id uuid);alter table public.documents add column folder_id uuid;grant usage on schema public,auth to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;`);
for(const name of ['202610050001_vocabulary_collections.sql','202610160001_collection_star_auto_append.sql'])await db.exec(await readFile(root+'/supabase/migrations/'+name,'utf8'));
await db.exec(`set role authenticated;select set_config('app.uid','${uid}',false);insert into documents(id,user_id,title,original_text,analysis,created_at) values('${source}','${uid}','Original passage','Source','{}','2026-10-18');insert into vocabulary(user_id,document_id,sentence_id,word,meaning,source_sentence,translation,created_at) values('${uid}','${source}',1,'original','원래의','The original text.','원래 글','2026-10-18');`);
const collection=(await db.query(`select (create_vocabulary_collection('Combined',array['${source}'::uuid],null,'all')).id as id`)).rows[0].id;
// New words after creation, including unstarred, should await a user's selection.
await db.query(`insert into vocabulary(id,user_id,document_id,sentence_id,word,meaning,source_sentence,translation,created_at) values($1,$3,$4,2,'memorable','기억할 만한','A memorable lesson.','기억할 만한 수업',now()+interval '1 second'),($2,$3,$4,3,'contemplate','숙고하다','Contemplate the idea.','생각을 숙고하다',now()+interval '2 seconds')`,[w1,w2,uid,source]);
const migration=await readFile(root+'/supabase/migrations/202610200001_collection_selected_updates.sql','utf8');await db.exec('reset role;');await db.exec(migration);await db.exec(migration);await db.exec(`set role authenticated;`);
await db.query(`insert into study_progress(user_id,document_id,sentence_notes) values($1,$2,jsonb_build_object('__moonwords_study_sets_v1',jsonb_build_object('starred',jsonb_build_array('word:'||$3::text),'important',jsonb_build_array('word:'||$3::text))::text))`,[uid,source,w1]);
const count=async()=>Number((await db.query('select count(*) as n from vocabulary where document_id=$1',[collection])).rows[0].n);
assert.equal(await count(),1);await db.query('select sync_vocabulary_collection_stars($1)',[collection]);assert.equal(await count(),1);
let listed=(await db.query('select list_vocabulary_collection_updates($1) as v',[collection])).rows[0].v;assert.equal(listed.totalCount,2);
const imported=(await db.query('select import_vocabulary_collection_updates($1,$2) as v',[collection,[w1]])).rows[0].v;assert.equal(imported.addedCount,1);assert.equal(await count(),2);assert.equal(imported.document.analysis.sentences.length,2);
let settings=JSON.parse((await db.query('select sentence_notes from study_progress where document_id=$1',[collection])).rows[0].sentence_notes.__moonwords_study_sets_v1);assert.equal(settings.starred.length,1);assert.equal(settings.important.length,1);assert.equal((await db.query('select import_vocabulary_collection_updates($1,$2) as v',[collection,[w1,w1]])).rows[0].v.addedCount,0);
listed=(await db.query('select list_vocabulary_collection_updates($1) as v',[collection])).rows[0].v;assert.equal(listed.totalCount,1);assert.equal(listed.candidates[0].id,w2);
// Unselected word stays absent. Import an unstarred word without manufacturing a star.
assert.equal((await db.query('select import_vocabulary_collection_updates($1,$2) as v',[collection,[w2]])).rows[0].v.addedCount,1);
settings=JSON.parse((await db.query('select sentence_notes from study_progress where document_id=$1',[collection])).rows[0].sentence_notes.__moonwords_study_sets_v1);assert.equal(settings.starred.length,1);
await db.exec(`reset role;insert into documents(id,user_id,title,original_text,analysis) values('${foreign}','${other}','Private','Private','{}');set role authenticated;`);
await assert.rejects(db.query('select list_vocabulary_collection_updates($1)',[foreign]));
await assert.rejects(db.query('select import_vocabulary_collection_updates($1,$2)',[collection,[foreign]]));
assert.equal(await count(),3);
console.log('PASS actual PostgreSQL: migration rerun, RLS isolation, no auto append/legacy sync, candidate list, selection only, dedupe/retry, unstarred import, marks, analysis counts, invalid selection rejection');
}finally{await db.close();}

});
