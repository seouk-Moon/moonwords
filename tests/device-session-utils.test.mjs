import test from 'node:test';
import assert from 'node:assert/strict';
import { describeDevice, readSessionId, sessionErrorMessage } from '../src/lib/device-session-utils.ts';
test('browser labels distinguish Samsung, Edge, Chrome and Apple browsers', () => {
  assert.equal(describeDevice('Android Chrome/130 SamsungBrowser/26'), 'Android · 삼성 인터넷');
  assert.equal(describeDevice('Windows Chrome/130 Safari/537 Edg/130'), 'Windows · Edge');
  assert.equal(describeDevice('iPhone AppleWebKit CriOS/130 Safari/600'), 'iPhone · Chrome');
  assert.equal(describeDevice('iPad AppleWebKit Safari/600'), 'iPad · Safari');
});
test('session ID is decoded for display/lifecycle only; corrupt tokens are ignored', () => {
  const jwt = `x.${Buffer.from(JSON.stringify({session_id:'sample-id'})).toString('base64url')}.x`;
  assert.equal(readSessionId(jwt),'sample-id');
  for (const value of ['', 'bad', 'x.nope.x', 'x.e30.x']) assert.equal(readSessionId(value),'');
  assert.match(sessionErrorMessage({code:'PGRST202',message:'missing'}),/SQL/);
});
