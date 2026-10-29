import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedAccountSession,withAccountDeadline} from '../src/lib/account-session.ts';
const session={user:{id:'account-a'}};
function client(s=session,user={id:'account-a'},err=null){return {auth:{getSession:async()=>({data:{session:s},error:null}),getUser:async()=>({data:{user},error:err})}};}
test('no credentials is signed out without a user request',async()=>{const c=client(null);c.auth.getUser=()=>{throw Error('must not call')};assert.equal(await verifiedAccountSession(c),null);});
test('only a matching server-verified account is accepted',async()=>{assert.equal(await verifiedAccountSession(client()),session);assert.equal(await verifiedAccountSession(client(session,{id:'account-b'})),null);assert.equal(await verifiedAccountSession(client(session,null,{status:401})),null);});
test('network failure is reported instead of silently becoming signed out',async()=>{await assert.rejects(verifiedAccountSession(client(session,null,{status:0})),/계정 서버/);});
test('stalled requests settle and successful responses preserve their result',async()=>{await assert.rejects(withAccountDeadline(new Promise(()=>{}),10),/계정 서버/);assert.equal(await withAccountDeadline(Promise.resolve(false),30),false);});
