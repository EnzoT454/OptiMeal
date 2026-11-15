const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function client({ userId = 'alice', refreshedUserId = userId, responses = [] } = {}) {
  const calls = [], exports = {};
  let session = { user: { id: userId }, access_token: 'original' };
  const source = fs.readFileSync(path.join(__dirname, '../services/api.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, process: { env: { EXPO_PUBLIC_API_URL: 'https://api.example.test' } },
    AbortController, setTimeout, clearTimeout, Error,
    require: () => ({ supabase: { auth: {
      getSession: async () => ({ data: { session }, error: null }),
      refreshSession: async () => { session = { user: { id: refreshedUserId }, access_token: 'refreshed' }; return { data: { session }, error: null }; },
    } } }),
    fetch: async (...args) => { calls.push(args); return responses.shift(); },
  });
  return { ...exports, calls };
}
const response = (status, json) => ({ status, ok: status < 400, json: async () => json });

test('une commande du compte A ne part jamais avec la session B', async () => {
  const c = client({ userId: 'bob' });
  await assert.rejects(c.api('/list', {}, true, 15000, 'alice'), /compte a changé/);
  assert.equal(c.calls.length, 0);
});

test('le renouvellement conserve la clé idempotente et le corps de la commande', async () => {
  const c = client({ responses: [response(401, {}), response(200, { item: 'saved' })] });
  const options = { method: 'POST', headers: { 'Idempotency-Key': 'stable' }, body: '{"name":"Courses"}' };
  const result = await c.api('/list', options, true, 15000, 'alice');
  assert.equal(result.item, 'saved');
  assert.equal(c.calls[1][1].headers['Idempotency-Key'], 'stable');
  assert.equal(c.calls[1][1].body, options.body);
  assert.equal(c.calls[1][1].headers.Authorization, 'Bearer refreshed');
});

test('un changement de compte pendant le renouvellement bloque le second envoi', async () => {
  const c = client({ refreshedUserId: 'bob', responses: [response(401, {})] });
  await assert.rejects(c.api('/list', {}, true, 15000, 'alice'), /compte a changé/);
  assert.equal(c.calls.length, 1);
});

test('le client conserve le code métier et la révision d’un conflit', async () => {
  const c = client({ responses: [response(409, { error: {
    code: 'LIST_REVISION_CONFLICT', message: 'La liste a changé.', current_revision: 8, list_id: 'list-a',
  } })] });
  await assert.rejects(c.api('/list'), error => {
    assert.equal(error.status, 409);
    assert.equal(error.code, 'LIST_REVISION_CONFLICT');
    assert.equal(error.context.current_revision, 8);
    return true;
  });
});
