const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const tick = () => new Promise(resolve => setImmediate(resolve));
function hook() {
  const slots = [], effects = [], intervals = new Set(), stores = new Map();
  let cursor = 0, account = 'alice', enabled = true, fail = true, syncImpl;
  const snapshot = { id: 'list', revision: 1, items: [], purchases: [] };
  stores.set('alice', { version: 1, snapshot, queue: [], syncedAt: '2026-11-16T12:00:00Z' });
  const exports = {};
  const services = {
    async readOfflineList(user) { return stores.get(user) ?? null; },
    async cacheList(user, value) { const state = { snapshot: value, queue: [], syncedAt: 'now' }; stores.set(user, state); return state; },
    async synchronizePurchases(user, id, current) {
      if (syncImpl) return syncImpl(user, id, current);
      if (fail) throw new Error('offline');
      return stores.get(user);
    },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../components/lists/useOfflineCourses.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, Error, setInterval(fn) { intervals.add(fn); return fn; }, clearInterval(fn) { intervals.delete(fn); },
    require(name) {
      if (name === 'react') return {
        useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: initial }; return [slots[i].value, value => { slots[i].value = value; }]; },
        useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
        useEffect(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((v, n) => v !== slots[i].deps[n])) {
          const old = slots[i]; slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); });
        } },
      };
      if (name.endsWith('/api')) return { ApiError: class extends Error {} };
      if (name.endsWith('shoppingOffline')) return services;
      if (name.endsWith('shoppingLists')) return { fetchList: async () => { throw new Error('offline'); } };
      throw new Error(name);
    },
  });
  const render = () => { cursor = 0; return exports.useOfflineCourses(account, 'list', enabled); };
  return { render, stores, intervals, set account(value) { account = value; }, set fail(value) { fail = value; }, set sync(value) { syncImpl = value; },
    async settle() { render(); effects.splice(0).forEach(fn => fn()); await tick(); return render(); },
    unmount() { slots.forEach(slot => slot.cleanup?.()); } };
}
test('réouverture sans réseau : liste complète, date et file sont disponibles ; retour réseau réessayé', async () => {
  const h = hook(); const state = await h.settle();
  assert.equal(state.state.snapshot.id, 'list'); assert.equal(state.offline, true);
  assert.equal(state.busy, false); assert.equal(state.error, 'offline');
  h.fail = false; for (const retry of h.intervals) retry(); await tick();
  assert.equal(h.render().offline, false); assert.equal(h.render().error, '');
  h.unmount(); assert.equal(h.intervals.size, 0);
});
test('changement de compte masque immédiatement cache et file avant les effets', async () => {
  const h = hook(); await h.settle(); h.account = 'bob';
  assert.equal(h.render().state, null);
  await h.settle(); assert.equal(h.render().state, null);
  h.account = 'alice'; const restored = await h.settle();
  assert.equal(restored.state.snapshot.id, 'list');
});
test('synchronisation tardive du compte précédent ne remplace pas le nouvel écran', async () => {
  const h = hook(); let finish;
  h.sync = () => new Promise(resolve => { finish = resolve; });
  await h.settle(); h.account = 'bob'; await h.settle();
  const oldFinish = finish;
  h.stores.set('alice', { ...h.stores.get('alice'), snapshot: { id: 'list', revision: 5 } });
  h.sync = async user => h.stores.get(user);
  h.account = 'alice'; await h.settle();
  oldFinish({ snapshot: { id: 'list', revision: 1 }, queue: [], syncedAt: 'old' }); await tick();
  assert.equal(h.render().state.snapshot.revision, 5);
});
