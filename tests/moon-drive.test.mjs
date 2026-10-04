import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';

const raw = readFileSync(new URL('../supabase/functions/moon-drive/index.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(raw.replace(/^import .*\n/, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
function setup({ locked = false, uploadError = false, full = false, deleteError = false } = {}) {
  let handler;
  const files = new Map(); const calls = [];
  const admin = {
    rpc: async (name, args) => { calls.push([name, args]);
      if (name === 'moon_drive_check_gate') return { data: !locked, error: null };
      if (full) return { error: { message: 'Drive capacity exceeded' } };
      files.set(args.file_id, { id: args.file_id, name: args.file_name, size: args.file_size, ready: false });
      return { error: null };
    },
    from: () => ({
      select: () => ({
        order: () => ({ limit: async () => ({ data: [...files.values()], error: null }) }),
        eq: (_, id) => ({ maybeSingle: async () => ({ data: files.get(id) ?? null, error: null }) }),
      }),
      update: (patch) => ({ eq: async (_, id) => { Object.assign(files.get(id), patch); return { error: null }; } }),
      delete: () => ({ eq: async (_, id) => { files.delete(id); return { error: null }; } }),
    }),
    storage: { from: () => ({
      upload: async (id, file, options) => { calls.push(['upload', id, file.size, options]); return { error: uploadError ? {} : null }; },
      remove: async ids => { calls.push(['remove', ids]); return { error: deleteError ? {} : null }; },
      createSignedUrl: async (id, seconds, options) => { calls.push(['signed', id, seconds, options]); return { data: { signedUrl: 'https://example.test/file' }, error: null }; },
    }) },
  };
  vm.runInNewContext(code, { createClient: () => admin, crypto: webcrypto, Response, File, TextEncoder,
    Deno: { env: { get: key => ({ MOON_DRIVE_CODE: '042819', SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'test' })[key] }, serve: f => { handler = f; } },
  });
  const request = (body, pin = '042819') => handler(new Request('https://example.test/moon-drive', {
    method: 'POST', headers: { 'x-drive-code': pin, ...(body instanceof FormData ? {} : { 'content-type': 'application/json' }) },
    body: body instanceof FormData ? body : JSON.stringify(body),
  }));
  return { request, files, calls };
}
const form = (size = 12) => { const f = new FormData(); f.append('file', new File([new Uint8Array(size)], '테스트.pdf')); return f; };
test('missing or wrong code cannot list, upload, download or delete', async () => {
  const s = setup();
  for (const body of [{ action: 'list' }, form(), { action: 'delete', id: 'anything' }, { action: 'download', id: 'anything' }])
    assert.equal((await s.request(body, '111111')).status, 403);
  assert.ok(s.calls.every(c => c[0] === 'moon_drive_check_gate'));
});
test('global lock blocks even correct code until gate reopens', async () => {
  assert.equal((await setup({ locked: true }).request({ action: 'list' })).status, 429);
});
test('successful upload reserves first, marks ready, lists size and signs download', async () => {
  const s = setup(); assert.equal((await s.request(form())).status, 200);
  const listing = await (await s.request({ action: 'list' })).json();
  assert.equal(listing.used, 12); assert.equal(listing.capacity, 200 * 1024 * 1024);
  assert.equal(listing.files[0].ready, true);
  const id = listing.files[0].id;
  assert.equal((await s.request({ action: 'download', id })).status, 200);
  const signed = s.calls.find(c => c[0] === 'signed'); assert.equal(signed[2], 60);
  assert.equal(signed[3].download, '테스트.pdf');
  assert.equal((await s.request({ action: 'delete', id })).status, 200);
  assert.equal(s.files.size, 0);
});
test('capacity denial never uploads; failed upload releases reserved capacity', async () => {
  const full = setup({ full: true }); assert.equal((await full.request(form())).status, 409);
  assert.ok(!full.calls.some(c => c[0] === 'upload'));
  const failed = setup({ uploadError: true }); assert.equal((await failed.request(form())).status, 500);
  assert.equal(failed.files.size, 0);
});
test('empty and oversized files fail before reserve or upload', async () => {
  const s = setup();
  assert.equal((await s.request(form(0))).status, 400);
  assert.equal((await s.request(form(20 * 1024 * 1024 + 1))).status, 400);
  assert.ok(s.calls.every(c => c[0] === 'moon_drive_check_gate'));
});
test('storage delete failure retains record and capacity for retry', async () => {
  const s = setup({ deleteError: true }); await s.request(form());
  const id = [...s.files.keys()][0]; assert.equal((await s.request({ action: 'delete', id })).status, 500);
  assert.equal(s.files.size, 1);
});
