import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';
const uid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',c='cccccccc-cccc-4ccc-8ccc-cccccccccccc',foreign='ffffffff-ffff-4fff-8fff-ffffffffffff';
test('nested folders: persistence, cycles, ownership and non-destructive deletion',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE));const db=new PGlite();
 try {
 await db.exec(`create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select current_setting('app.uid',true)::uuid$$;insert into auth.users values('${uid}'),('${other}');create table documents(id uuid primary key,user_id uuid,title text,created_at timestamptz default now());`);
 await db.exec(await readFile(new URL('../supabase/migrations/202608230002_document_folders.sql',import.meta.url),'utf8'));
 const sql=await readFile(new URL('../supabase/migrations/202610220001_nested_folders.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 await db.exec(`grant usage on schema public,auth to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;insert into document_folders(id,user_id,name) values('${a}','${uid}','A'),('${b}','${uid}','B'),('${c}','${uid}','C'),('${foreign}','${other}','Other');insert into documents(id,user_id,title,folder_id) values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','${uid}','Keep me','${a}');set role authenticated;select set_config('app.uid','${uid}',false);`);
 const move=(id,parent)=>db.query('select move_library_folder($1,$2)',[id,parent]);
 await move(b,a);await move(c,b);assert.equal((await db.query('select parent_id from document_folders where id=$1',[c])).rows[0].parent_id,b);
 await assert.rejects(()=>move(a,c),/하위 폴더/);await assert.rejects(()=>move(a,a),/자기/);await assert.rejects(()=>move(a,foreign),/폴더/);await assert.rejects(()=>move(foreign,a),/폴더/);
 await assert.rejects(()=>db.query('update document_folders set parent_id=$2 where id=$1',[a,c]),/하위 폴더/);
 await move(c,null);assert.equal((await db.query('select parent_id from document_folders where id=$1',[c])).rows[0].parent_id,null);
 await db.query('delete from document_folders where id=$1',[a]);assert.equal((await db.query('select parent_id from document_folders where id=$1',[b])).rows[0].parent_id,null);assert.equal((await db.query('select title,folder_id from documents')).rows[0].title,'Keep me');assert.equal((await db.query('select folder_id from documents')).rows[0].folder_id,null);
 } finally {await db.close();}
});
