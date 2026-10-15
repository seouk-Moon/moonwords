import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[new URL('../src/features/vocabulary/collection-star-sync.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
const {inheritSourceStars,loadSourceStars}=await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`);
const progress=(document_id,starred=[],other={})=>({user_id:'u',document_id,understood_sentence_ids:[],bookmarked_sentence_ids:[],last_studied_at:'',sentence_notes:{note:'원래 메모',__moonwords_study_sets_v1:JSON.stringify({setSize:7,starred,important:['word:own'],incorrect:['word:old'],...other})}});
const uuid=i=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
test('new source stars map to copied IDs by word AND meaning and preserve manual marks/settings/notes',()=>{
 const p=progress('copy',['word:own']);const words=[{id:'copy-a',word:' BANK ',meaning:' 은행 '},{id:'copy-b',word:'bank',meaning:'강둑'}];const source=[{id:'original-a',document_id:'source',word:'bank',meaning:'은행'}];
 const result=inheritSourceStars(p,words,source,[progress('source',['word:original-a'])]);const settings=JSON.parse(result.sentence_notes.__moonwords_study_sets_v1);assert.deepEqual(settings.starred,['word:own','word:copy-a']);assert.equal(settings.setSize,7);assert.deepEqual(settings.important,['word:own']);assert.equal(result.sentence_notes.note,'원래 메모');
 assert.equal(inheritSourceStars(result,words,source,[progress('source',['word:original-a'])]),result);
});
test('no source stars or deleted sources do not remove copied or manual stars',()=>{
 const p=progress('copy',['word:copy-a']);assert.equal(inheritSourceStars(p,[{id:'copy-a',word:'bank',meaning:'은행'}],[],[]),p);
});
test('source loader scopes requests to user and selected documents, batching starred IDs under row limits',async()=>{
 const original=Array.from({length:405},(_,i)=>({id:uuid(i),document_id:'source',word:'word'+i,meaning:'뜻'+i}));const calls=[];
 const client={from(table){const filters={};const q={select(){return q},eq(k,v){filters[k]=v;return q},in(k,v){filters[k]=v;return q},then(resolve){calls.push({table,...filters});resolve({error:null,data:table==='study_progress'?[progress('source',original.map(w=>'word:'+w.id))]:original.filter(w=>filters.id.includes(w.id))})}};return q}};
 const result=await loadSourceStars(client,'u',{id:'copy',analysis:{collection:{sourceDocumentIds:['source']}}},[{id:'copy-last',word:'word404',meaning:'뜻404'}],progress('copy'));
 assert.ok(JSON.parse(result.sentence_notes.__moonwords_study_sets_v1).starred.includes('word:copy-last'));assert.equal(calls.filter(c=>c.table==='vocabulary').length,3);assert.ok(calls.every(c=>c.user_id==='u'&&c.document_id.length===1));
});
