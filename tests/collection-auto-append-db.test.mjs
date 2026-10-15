import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {pathToFileURL} from 'node:url';
const read=n=>readFileSync(new URL('../supabase/migrations/'+n,import.meta.url),'utf8');
const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const sourceA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',sourceB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',foreign='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const wid=i=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
test('Postgres: new starred members append immediately, dedup, metadata/marks preservation, catchup, nesting, RLS and limits',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE).href);const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
  await db.exec(read('202608200001_initial_schema.sql').split('insert into storage.buckets')[0].replace('create extension if not exists pgcrypto;',''));
  await db.exec(read('202608230002_document_folders.sql'));await db.exec(read('202610050001_vocabulary_collections.sql'));
  await db.exec('grant usage on schema public to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;');
  await db.query('insert into auth.users values($1),($2)',[user,other]);
  for(const [id,owner,title] of [[sourceA,user,'본문 A'],[sourceB,user,'본문 B'],[foreign,other,'Foreign']])await db.query("insert into documents(id,user_id,title,original_text,analysis) values($1,$2,$3,'source','{}')",[id,owner,title]);
  const insert=async(id,doc,word,meaning,owner=user)=>db.query("insert into vocabulary(id,user_id,document_id,sentence_id,word,meaning,source_sentence,translation,note) values($1,$2,$3,-1,$4,$5,$4||' example.','번역','원래 메모')",[id,owner,doc,word,meaning]);
  await insert(wid(0),sourceA,'orbit','궤도');await insert(wid(9),sourceB,'beta','둘째');
  const progress={};
  const mark=async(doc,id,extra={})=>{const prior=progress[doc]??{setSize:7,starred:[],important:[],incorrect:[]};const next={...prior,...extra,starred:[...new Set([...prior.starred,'word:'+id])]};progress[doc]=next;await db.query('insert into study_progress(user_id,document_id,sentence_notes) values($1,$2,$3) on conflict(user_id,document_id) do update set sentence_notes=excluded.sentence_notes',[user,doc,JSON.stringify({keep:'보존 메모',__moonwords_study_sets_v1:JSON.stringify(next)})]);};
  await mark(sourceA,wid(0),{important:['word:'+wid(0)]});await mark(sourceB,wid(9));
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${user}';`);
  const create=async(ids,scope='all')=>(await db.query('select * from create_vocabulary_collection($1,$2,null,$3)',['통합',ids,scope])).rows[0];
  const target=await create([sourceA,sourceB]);const second=await create([sourceA],'important');const unrelated=await create([sourceB]);const nested=await create([target.id]);
  await db.exec('reset role;');await db.exec(read('202610160001_collection_star_auto_append.sql'));await db.exec(read('202610160001_collection_star_auto_append.sql'));await db.exec(`set role authenticated;set request.jwt.claim.sub='${user}';`);
  const rows=async id=>(await db.query('select * from vocabulary where document_id=$1 order by sentence_id',[id])).rows;
  const settings=async id=>JSON.parse((await db.query('select sentence_notes from study_progress where document_id=$1',[id])).rows[0].sentence_notes.__moonwords_study_sets_v1);
  const targetBase=await rows(target.id);await db.query('update study_progress set sentence_notes=sentence_notes||$2::jsonb where document_id=$1',[target.id,JSON.stringify({personal:'메모 유지'})]);
  const oldProgress=await settings(target.id);oldProgress.setSize=3;oldProgress.incorrect=['word:'+targetBase[0].id];await db.query('update study_progress set sentence_notes=jsonb_set(sentence_notes,$2,$3::jsonb) where document_id=$1',[target.id,['__moonwords_study_sets_v1'],JSON.stringify(JSON.stringify(oldProgress))]);
  await insert(wid(1),sourceA,'trajectory','궤적');assert.equal((await rows(target.id)).length,2);await mark(sourceA,wid(1));
  let copied=(await rows(target.id)).find(w=>w.word==='trajectory');assert.ok(copied);assert.equal(copied.source_sentence,'trajectory example.');assert.ok(copied.note.includes('본문 A'));assert.ok((await settings(target.id)).starred.includes('word:'+copied.id));assert.equal((await settings(target.id)).setSize,3);assert.equal((await settings(target.id)).incorrect.length,1);assert.equal((await rows(second.id)).length,2);assert.equal((await rows(unrelated.id)).length,1);assert.ok((await rows(nested.id)).some(w=>w.word==='trajectory'));
  const metadata=(await db.query('select analysis from documents where id=$1',[target.id])).rows[0].analysis;assert.equal(metadata.collection.wordCount,3);assert.ok(metadata.sentences.some(s=>s.id===copied.sentence_id&&s.english==='trajectory example.'));assert.equal(new Set(metadata.sentences.map(s=>s.id)).size,metadata.sentences.length);
  await insert(wid(2),sourceB,'TRAJECTORY','궤적');await mark(sourceB,wid(2));assert.equal((await rows(target.id)).filter(w=>w.word.toLowerCase()==='trajectory').length,1);assert.ok((await rows(target.id)).find(w=>w.id===copied.id).note.includes('본문 B'));
  await insert(wid(3),sourceA,'trajectory','탄도');await mark(sourceA,wid(3));assert.equal((await rows(target.id)).filter(w=>w.word.toLowerCase()==='trajectory').length,2);
  // Simulate words starred before this migration; opening catches up all missing entries.
  await db.exec('reset role;alter table study_progress disable trigger moonwords_collection_star_append;');await db.exec(`set role authenticated;set request.jwt.claim.sub='${user}';`);await insert(wid(4),sourceA,'abate','줄어들다');await mark(sourceA,wid(4));assert.ok(!(await rows(target.id)).some(w=>w.word==='abate'));await db.exec('reset role;alter table study_progress enable trigger moonwords_collection_star_append;');await db.exec(`set role authenticated;set request.jwt.claim.sub='${user}';`);
  const sync=async id=>(await db.query('select sync_vocabulary_collection_stars($1) data',[id])).rows[0].data;const caught=await sync(target.id);assert.equal(caught.addedCount,1);assert.ok(caught.document.analysis.sentences.some(s=>s.english==='abate example.'));assert.equal((await sync(target.id)).addedCount,0);
  await db.query("update study_progress set sentence_notes='{}' where document_id=$1",[sourceA]);assert.ok((await rows(target.id)).some(w=>w.word==='abate'));
  await assert.rejects(db.query('select moonwords_append_starred_word($1,$2)',[unrelated.id,wid(1)]));
  const n=(await rows(target.id)).length;await assert.rejects(db.query('select moonwords_append_starred_word($1,$2)',[target.id,wid(9+999)]));assert.equal((await rows(target.id)).length,n);
  await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${other}';`);await assert.rejects(sync(target.id));await assert.rejects(db.query('select moonwords_append_starred_word($1,$2)',[target.id,wid(1)]));await db.exec('reset role;set role anon;');await assert.rejects(sync(target.id));await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${user}';`);
  // 5000-word cap never deletes old entries or prevents the original star from saving.
  await db.query("insert into vocabulary(user_id,document_id,sentence_id,word,meaning,source_sentence,translation) select $1,$2,10000+i,'filler'||i,'뜻','example','번역' from generate_series(1,$3::integer) i",[user,second.id,5000-(await rows(second.id)).length]);
  await insert(wid(5),sourceA,'serendipity','뜻밖의 발견');await mark(sourceA,wid(5));assert.equal((await rows(second.id)).length,5000);assert.ok((await settings(sourceA)).starred.includes('word:'+wid(5)));assert.ok((await sync(second.id)).skippedCount>0);assert.ok((await rows(target.id)).some(w=>w.word==='serendipity'));
  await db.query('delete from documents where id=$1',[sourceA]);assert.ok((await rows(target.id)).some(w=>w.word==='abate'));assert.equal((await sync(target.id)).addedCount,0);
 }finally{await db.close()}
});
