import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

test('device sessions: ownership, revoked JWT denial, heartbeat, refresh token removal, global/local isolation', { skip: !process.env.PGLITE_MODULE }, async () => {
  const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
  const db = new PGlite();
  const u = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
  const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', c = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create table auth.sessions(id uuid primary key, user_id uuid references auth.users(id), created_at timestamptz default now(), updated_at timestamptz default now());
      create table auth.refresh_tokens(id bigint generated always as identity primary key, session_id uuid references auth.sessions(id), token text);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema public,auth to authenticated,anon;`);
    const sql = readFileSync(new URL('../supabase/migrations/202610180001_device_sessions.sql', import.meta.url), 'utf8');
    await db.exec(sql); await db.exec(sql); // Re-running the SQL is safe.
    await db.query('insert into auth.users values($1),($2)', [u, other]);
    for (const [id, owner] of [[a,u],[b,u],[c,other]]) {
      await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [id,owner]);
      await db.query("insert into auth.refresh_tokens(session_id,token) values($1,'secret')", [id]);
    }
    const asSession = async (user,id) => {
      await db.exec('reset role; set role authenticated;');
      await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [user,JSON.stringify({session_id:id})]);
    };
    await asSession(u,a);
    assert.equal((await db.query("select moonwords_touch_session('Windows · Chrome') ok")).rows[0].ok,true);
    const list = () => db.query('select * from moonwords_list_sessions()');
    let rows = (await list()).rows;
    assert.equal(rows.length,2); assert.equal(rows[0].session_id,a); assert.equal(rows[0].is_current,true);
    assert.equal(rows[0].device_name,'Windows · Chrome'); assert.ok(rows.every(r => r.session_id !== c));
    await assert.rejects(db.query('select * from auth.sessions'));
    await assert.rejects(db.query('select * from public.moonwords_session_devices'));
    await assert.rejects(db.query('select moonwords_live_session_id()'));
    assert.equal((await db.query('select moonwords_revoke_sessions($1) n',[c])).rows[0].n,0);
    assert.equal((await db.query('select moonwords_revoke_sessions($1) n',[b])).rows[0].n,1);
    assert.equal((await list()).rows.length,1);
    await asSession(u,b); // A still-valid JWT from a revoked browser cannot act.
    assert.equal((await db.query("select moonwords_touch_session('old') ok")).rows[0].ok,false);
    await assert.rejects(list()); await assert.rejects(db.query('select moonwords_revoke_sessions(null)'));
    await asSession(other,a); // Wrong owner of a session ID.
    assert.equal((await db.query("select moonwords_touch_session('forged') ok")).rows[0].ok,false);
    await asSession(other,c);
    assert.equal((await db.query("select moonwords_touch_session('Android · 삼성 인터넷') ok")).rows[0].ok,true);
    assert.equal((await list()).rows.length,1);
    await asSession(u,a);
    assert.equal((await db.query('select moonwords_revoke_sessions(null) n')).rows[0].n,1);
    assert.equal((await db.query("select moonwords_touch_session('revoked') ok")).rows[0].ok,false);
    await db.exec('reset role;');
    assert.deepEqual((await db.query('select session_id from auth.refresh_tokens')).rows.map(r=>r.session_id),[c]);
    assert.deepEqual((await db.query('select session_id from public.moonwords_session_devices')).rows.map(r=>r.session_id),[c]);
    await db.exec('set role anon;');
    await assert.rejects(list()); await assert.rejects(db.query("select moonwords_touch_session('anon')"));
    await assert.rejects(db.query('select moonwords_revoke_sessions(null)'));
  } finally { await db.close(); }
});
