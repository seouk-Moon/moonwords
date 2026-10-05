// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite module.
// Example: PGLITE_MODULE=/absolute/node_modules/@electric-sql/pglite/dist/index.js node --test tests/vocabulary-collections-db.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.PGLITE_MODULE;
const user = '11111111-1111-1111-1111-111111111111', other = '22222222-2222-2222-2222-222222222222';
const docA='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', docB='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', foreign='cccccccc-cccc-cccc-cccc-cccccccccccc';
const folder='ffffffff-ffff-ffff-ffff-ffffffffffff';
const ids=['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000005'];
const read = name => readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
test('Postgres integration: copy, marks, dedup, folder, RLS, rollback and independent deletion', {skip:!modulePath}, async()=>{
 const {PGlite}=await import(pathToFileURL(modulePath).href);const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  await db.exec(read('202608200001_initial_schema.sql').split('insert into storage.buckets')[0].replace('create extension if not exists pgcrypto;',''));
  await db.exec(read('202608230002_document_folders.sql'));
  await db.exec(read('202610050001_vocabulary_collections.sql'));
  await db.exec('grant usage on schema public to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;');
  await db.query('insert into auth.users values ($1),($2)',[user,other]);
  for(const [id,owner,title] of [[docA,user,'A'],[docB,user,'B'],[foreign,other,'Foreign']])
   await db.query("insert into public.documents(id,user_id,title,original_text,analysis) values($1,$2,$3,'source','{}')",[id,owner,title]);
  await db.query("insert into document_folders(id,user_id,name) values($1,$2,'시험')",[folder,user]);
  const values=[[ids[0],docA,'orbit','궤도'],[ids[1],docB,'ORBIT','궤도'],[ids[2],docB,'orbit','공전하다'],[ids[3],docB,'dust','먼지'],[ids[4],docA,'rocket','로켓']];
  for(const [id,doc,word,meaning] of values)await db.query("insert into vocabulary(id,user_id,document_id,sentence_id,word,meaning,source_sentence,translation,note) values($1,$2,$3,0,$4,$5,'A rocket crosses the orbit with dust.','로켓이 궤도를 지난다.','메모')",[id,user,doc,word,meaning]);
  for(const [doc,stars,important] of [[docA,[ids[0],ids[4]],[]],[docB,[ids[1],ids[2]],[ids[1],ids[3]]]])
   await db.query('insert into study_progress(user_id,document_id,sentence_notes) values($1,$2,$3)',[user,doc,JSON.stringify({__moonwords_study_sets_v1:JSON.stringify({setSize:10,starred:stars.map(id=>'word:'+id),important:important.map(id=>'word:'+id),incorrect:[]})})]);
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${user}';`);
  const create=async(scope,sourceIds=[docA,docB],targetFolder=folder)=> (await db.query('select * from public.create_vocabulary_collection($1,$2,$3,$4)',['통합 단어장',sourceIds,targetFolder,scope])).rows[0];
  const merged=await create('starred');
  assert.equal(merged.source_type,'vocabulary_collection');assert.equal(merged.folder_id,folder);assert.equal(merged.analysis.collection.wordCount,3);
  const copied=(await db.query('select * from vocabulary where document_id=$1 order by sentence_id',[merged.id])).rows;
  assert.equal(copied.length,3);assert.deepEqual(copied.map(w=>w.sentence_id),[0,1,2]);assert.ok(copied.every(w=>w.review_count===0));
  assert.equal(copied.filter(w=>w.word.toLowerCase()==='orbit').length,2);
  const copiedProgress=(await db.query('select sentence_notes from study_progress where document_id=$1',[merged.id])).rows[0];
  const settings=JSON.parse(copiedProgress.sentence_notes.__moonwords_study_sets_v1);
  assert.equal(settings.starred.length,3);assert.equal(settings.important.length,1);assert.ok(settings.starred.every(k=>copied.some(w=>'word:'+w.id===k)));
  assert.ok(copied[0].note.includes('A')&&copied[0].note.includes('B'));
  const all=await create('all');assert.equal(all.analysis.collection.wordCount,4);
  const important=await create('important');assert.equal(important.analysis.collection.wordCount,2);
  const counts=async()=>Number((await db.query('select count(*) n from documents')).rows[0].n);
  const before=await counts();
  await assert.rejects(create('starred',[foreign]));await assert.rejects(create('all',[docA],foreign));await assert.rejects(create('all',[]));
  assert.equal(await counts(),before);
  // No starred words: whole document insertion is rolled back.
  await db.query('update study_progress set sentence_notes=\'{}\' where document_id=any($1)',[[docA,docB]]);
  await assert.rejects(create('starred'));assert.equal(await counts(),before);
  await db.query('delete from documents where id=any($1)',[[docA,docB]]);
  assert.equal((await db.query('select count(*) n from vocabulary where document_id=$1',[merged.id])).rows[0].n,3);
  await db.query('delete from documents where id=$1',[merged.id]);
  assert.equal((await db.query('select count(*) n from vocabulary where document_id=$1',[merged.id])).rows[0].n,0);
  await db.exec('reset role;set role anon;');await assert.rejects(db.query("select public.create_vocabulary_collection('x',array[]::uuid[],null,'all')"));
 } finally {await db.close();}
});
