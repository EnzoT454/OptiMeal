const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
function hook({ stored = null, send, userId = 'alice' } = {}) {
  const states = [], effects = [], writes = [], calls = [];
  const storage = new Map([[userId, stored]]);
  let index = 0;
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../components/lists/useListCommand.ts'), 'utf8');
  const react = {
    useState(initial) { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = value; }]; },
    useRef(initial) { const i = index++; if (!(i in states)) states[i] = { current: initial }; return states[i]; },
    useEffect(fn, deps) {
      const i = index++;
      if (!(i in states) || deps.some((value, n) => value !== states[i].deps[n])) {
        effects.push(() => { states[i]?.cleanup?.(); states[i] = { deps, cleanup: fn() }; });
      }
    },
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, require(name) {
      if (name === 'react') return react;
      if (name.endsWith('AuthContext')) return { useAuth: () => ({ session: userId ? { user: { id: userId } } : null }) };
      if (name.endsWith('/api')) return { ApiError };
      if (name.endsWith('accountStorage')) return {
        readAccountJSON: async account => storage.get(account) ?? null,
        writeAccountJSON: async (...args) => { writes.push(args); storage.set(args[0], args[2]); },
      };
      if (name.endsWith('shoppingLists')) return { sendListCommand: async (...args) => { calls.push(args); return send(...args); } };
      throw new Error(name);
    }, Error,
  });
  function render() { index = 0; return exports.useListCommand('create'); }
  return { render, changeUser(value) { userId = value; }, async ready() { render(); for (const effect of effects.splice(0)) effect(); await new Promise(resolve => setImmediate(resolve)); }, calls, writes };
}
const command = { key: 'same-key', path: '/api/v1/shopping-lists', method: 'POST', body: { name: 'Courses' } };

test('une réponse perdue conserve la commande ; le nouvel essai réutilise clé, corps et compte', async () => {
  let attempt = 0;
  const view = hook({ send: async () => { if (++attempt === 1) throw new Error('Réseau'); return { id: 'saved' }; } });
  await view.ready();
  assert.equal(await view.render().run(command), null);
  assert.equal(view.render().pending.key, 'same-key');
  assert.equal(view.render().error, 'Réseau');
  assert.equal((await view.render().run({ ...command, key: 'other' })).id, 'saved');
  assert.equal(view.calls[0][0], view.calls[1][0]);
  assert.equal(view.calls[1][1], 'alice');
  assert.equal(view.render().pending, null);
  assert.equal(view.writes[0][2], command);
  assert.equal(view.writes.at(-1)[2], null);
});

test('une commande restaurée après fermeture est rejouée sans créer une autre demande', async () => {
  const view = hook({ stored: command, send: async () => ({ id: 'existing' }) });
  await view.ready();
  assert.equal(view.render().locked, true);
  assert.equal((await view.render().run({ ...command, key: 'new' })).id, 'existing');
  assert.equal(view.calls[0][0].key, command.key);
});

test('un conflit explicite libère le formulaire et garde le message pour relire la liste', async () => {
  const view = hook({ send: async () => { throw new ApiError(409, 'La liste a changé.'); } });
  await view.ready();
  await view.render().run(command);
  assert.equal(view.render().pending, null);
  assert.equal(view.render().locked, false);
  assert.equal(view.render().error, 'La liste a changé.');
});

test('les doubles appuis ne lancent qu’une commande', async () => {
  let finish;
  const view = hook({ send: () => new Promise(resolve => { finish = resolve; }) });
  await view.ready();
  const first = view.render().run(command);
  assert.equal(await view.render().run(command), null);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(view.calls.length, 1);
  finish({ id: 'single' });
  assert.equal((await first).id, 'single');
});

test('un visiteur ne peut pas envoyer de commande', async () => {
  const view = hook({ userId: null, send: async () => { throw new Error('Unexpected'); } });
  await view.ready();
  assert.equal(await view.render().run(command), null);
  assert.equal(view.calls.length, 0);
});


test('une réponse d’achat tardive ne revient pas dans le compte suivant', async () => {
  let finish;
  const view = hook({ send: () => new Promise(resolve => { finish = resolve; }) });
  await view.ready();
  const purchase = { ...command, method: 'PUT', path: '/api/v1/shopping-lists/list/product-purchases', body: { purchased_units: 1 } };
  const pending = view.render().run(purchase);
  await new Promise(resolve => setImmediate(resolve));
  view.changeUser('bob');
  assert.equal(view.render().locked, true);
  await view.ready();
  finish({ id: 'alice-list' });
  assert.equal(await pending, null);
  assert.equal(view.render().pending, null);
  assert.equal(view.render().busy, false);
  assert.equal(view.calls[0][1], 'alice');
});
