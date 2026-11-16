const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const copy = value => JSON.parse(JSON.stringify(value));
class ApiError extends Error { constructor(status, code = 'LIST_REVISION_CONFLICT') { super(code); this.status = status; this.code = code; } }
function fixture() {
  return { id: 'list', name: 'Courses', revision: 1, status: 'active', purchase_date: '2026-11-16',
    items: [{ id: 'rice', need_revision: 1, required: [{ amount: '100', unit: 'g' }], owned: [], coverage_status: 'remaining' }],
    purchases: [], product_purchases: [], assignment: null, choices: [] };
}
function harness(storage = new Map()) {
  let remote = fixture(), sequence = 0, online = true, lose = false, sendCount = 0;
  const results = new Map(), calls = [];
  const api = { async fetchList(id, user) { if (!online) throw new Error('offline'); return copy(remote); },
    listCommand(path, body, method) { return { key: `key-${++sequence}`, path, body, method }; },
    listsPath: '/api/v1/shopping-lists',
    async sendListCommand(command, user) {
      calls.push(copy(command)); sendCount++;
      if (!online) throw new Error('offline');
      if (results.has(command.key)) return copy(results.get(command.key));
      if (command.body.expected_revision !== remote.revision) throw new ApiError(409);
      remote.revision++;
      const itemId = command.body.item_id || command.path.split('/').at(-2);
      remote.purchases = [{ id: 'purchase', item_id: itemId, purchased: command.body.purchased,
        coverage: command.body.coverage?.quantities ?? [], confirmed_need_revision: null }];
      results.set(command.key, copy(remote));
      if (lose) { lose = false; throw new Error('response lost'); }
      return copy(remote);
    } };
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../services/shoppingOffline.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports: module.exports, require(name) {
    if (name === './api') return { ApiError };
    if (name === './shoppingLists') return api;
    if (name === './accountStorage') return {
      async readAccountJSON(user, key, fallback) { return copy(storage.get(`${user}:${key}`) ?? fallback); },
      async updateAccountJSON(user, key, fallback, update) { const next = update(copy(storage.get(`${user}:${key}`) ?? fallback)); storage.set(`${user}:${key}`, copy(next)); return next; },
    };
    throw new Error(name);
  } });
  return { ...module.exports, storage, calls, api,
    set online(value) { online = value; }, set lose(value) { lose = value; },
    get remote() { return remote; }, set remote(value) { remote = value; }, get sendCount() { return sendCount; } };
}
const intent = (key = 'buy', purchased = true) => ({ key, method: 'PUT', path: '/api/v1/shopping-lists/list/items/rice/manual-purchase',
  body: { expected_revision: 1, purchased, coverage: purchased ? { quantities: [{ amount: '100', unit: 'g' }] } : {} } });

test('cache complet et date conservés après redémarrage, isolés par compte', async () => {
  const h = harness(); await h.cacheList('alice', fixture());
  const restored = harness(h.storage);
  assert.deepEqual(copy((await restored.readOfflineList('alice', 'list')).snapshot), fixture());
  assert.ok((await restored.readLatestOfflineList('alice')).syncedAt);
  assert.equal(await restored.readLatestOfflineList('bob'), null);
});
test('cocher puis décocher sans réseau conserve seulement le dernier état jamais envoyé', async () => {
  const h = harness(); await h.cacheList('alice', fixture()); h.online = false;
  await h.enqueuePurchase('alice', 'list', intent());
  const state = await h.enqueuePurchase('alice', 'list', intent('undo', false));
  assert.equal(state.queue.length, 1); assert.equal(state.queue[0].command.body.purchased, false);
  assert.equal(h.sendCount, 0);
  await assert.rejects(h.synchronizePurchases('alice', 'list'), /offline/);
  assert.equal((await h.readOfflineList('alice', 'list')).queue[0].sent, true);
});
test('réponse perdue après commit : rejouer exactement la clé et le corps, un seul achat', async () => {
  const h = harness(); await h.cacheList('alice', fixture()); await h.enqueuePurchase('alice', 'list', intent()); h.lose = true;
  await assert.rejects(h.synchronizePurchases('alice', 'list'), /response lost/);
  assert.equal(h.remote.revision, 2);
  const state = await h.synchronizePurchases('alice', 'list');
  assert.equal(state.queue.length, 0); assert.equal(h.remote.revision, 2);
  assert.deepEqual(h.calls[0], h.calls[1]);
});
test('une intention inverse ne remplace jamais une commande incertaine envoyée', async () => {
  const h = harness(); await h.cacheList('alice', fixture()); await h.enqueuePurchase('alice', 'list', intent()); h.lose = true;
  await assert.rejects(h.synchronizePurchases('alice', 'list'));
  assert.equal((await h.enqueuePurchase('alice', 'list', intent('undo', false))).queue.length, 2);
  const result = await h.synchronizePurchases('alice', 'list');
  assert.equal(result.queue.length, 0); assert.equal(h.remote.purchases[0].purchased, false);
  assert.equal(h.remote.revision, 3);
});
test('modification distante compatible : refus de révision puis nouvelle clé, sans écrasement du nom', async () => {
  const h = harness(); await h.cacheList('alice', fixture()); await h.enqueuePurchase('alice', 'list', intent());
  h.remote.name = 'Nom distant'; h.remote.revision = 2;
  const result = await h.synchronizePurchases('alice', 'list');
  assert.equal(result.queue.length, 0); assert.equal(result.snapshot.name, 'Nom distant');
  assert.notEqual(h.calls[0].key, h.calls[1].key); assert.equal(h.calls[1].body.expected_revision, 2);
});
test('besoin distant modifié : intention gardée jusqu’à résolution explicite', async () => {
  const h = harness(); await h.cacheList('alice', fixture()); await h.enqueuePurchase('alice', 'list', intent());
  h.remote.items[0].need_revision = 2; h.remote.revision = 2;
  let result = await h.synchronizePurchases('alice', 'list');
  assert.ok(result.queue[0].conflict); assert.equal(h.remote.purchases.length, 0);
  await h.synchronizePurchases('alice', 'list'); assert.equal(h.sendCount, 1);
  await h.resolvePurchase('alice', 'list', true);
  result = await h.synchronizePurchases('alice', 'list');
  assert.equal(result.queue.length, 0); assert.equal(h.calls.at(-1).body.expected_revision, 2);
});
test('cache actualisé avant envoi : détecter le conflit avant toute mutation', async () => {
  const h = harness(); await h.cacheList('alice', fixture()); await h.enqueuePurchase('alice', 'list', intent());
  h.remote.revision = 2; h.remote.status = 'completed'; await h.cacheList('alice', h.remote);
  const result = await h.synchronizePurchases('alice', 'list');
  assert.ok(result.queue[0].conflict); assert.equal(h.sendCount, 0);
  assert.equal((await h.resolvePurchase('alice', 'list', false)).queue.length, 0);
});
test('session expirée : aucune perte d’intention ni nouvelle clé', async () => {
  const h = harness(); await h.cacheList('alice', fixture()); await h.enqueuePurchase('alice', 'list', intent());
  h.api.sendListCommand = async () => { throw new ApiError(401, 'expired'); };
  await assert.rejects(h.synchronizePurchases('alice', 'list'), /expired/);
  const result = await h.readOfflineList('alice', 'list');
  assert.equal(result.queue[0].command.key, 'buy'); assert.equal(result.queue[0].conflict, undefined);
});
test('changement de compte pendant envoi : ne pas appliquer la réponse tardive', async () => {
  const h = harness(); await h.cacheList('alice', fixture()); await h.enqueuePurchase('alice', 'list', intent());
  let current = true; const send = h.api.sendListCommand;
  h.api.sendListCommand = async (...args) => { const result = await send(...args); current = false; return result; };
  await h.synchronizePurchases('alice', 'list', () => current);
  assert.equal((await h.readOfflineList('alice', 'list')).queue.length, 1);
  assert.equal(await h.readOfflineList('bob', 'list'), null);
});
test('ne pas remplacer le cache récent par une ancienne réponse rejouée', async () => {
  const h = harness(); await h.cacheList('alice', fixture());
  const recent = { ...fixture(), revision: 5 }; await h.cacheList('alice', recent);
  await h.cacheList('alice', fixture());
  assert.equal((await h.readOfflineList('alice', 'list')).snapshot.revision, 5);
});

test('plusieurs coches sont sérialisées avec la dernière révision confirmée', async () => {
  const h = harness(); await h.cacheList('alice', fixture());
  await h.enqueuePurchase('alice', 'list', intent());
  const other = intent('other'); other.path = other.path.replace('/rice/', '/bread/');
  await h.enqueuePurchase('alice', 'list', other);
  const state = await h.synchronizePurchases('alice', 'list');
  assert.equal(state.queue.length, 0); assert.equal(h.calls[1].body.expected_revision, 2);
});
test('achats produits identifiés par proposition, article et produit ; zéro reste un état cible', async () => {
  const h = harness(); await h.cacheList('alice', fixture());
  const product = { key: 'product', method: 'PUT', path: '/api/v1/shopping-lists/list/product-purchases',
    body: { expected_revision: 1, comparison_id: 'comparison', item_id: 'rice', product_id: 'maxi:rice', purchased_units: 2 } };
  await h.enqueuePurchase('alice', 'list', product);
  await h.enqueuePurchase('alice', 'list', { ...product, key: 'zero', body: { ...product.body, purchased_units: 0 } });
  const state = await h.readOfflineList('alice', 'list');
  assert.equal(state.queue.length, 1); assert.equal(state.queue[0].command.body.purchased_units, 0);
  assert.equal(h.isPurchase(product, 'other-list'), false);
  assert.notEqual(h.purchaseTarget(product), h.purchaseTarget({ ...product, body: { ...product.body, comparison_id: 'other' } }));
});
test('un achat distant différent sur la même cible reste un conflit, jamais écrasé automatiquement', async () => {
  const h = harness(); await h.cacheList('alice', fixture()); await h.enqueuePurchase('alice', 'list', intent());
  h.remote.revision = 2; h.remote.purchases = [{ item_id: 'rice', purchased: true, coverage: [{ amount: '50', unit: 'g' }] }];
  const state = await h.synchronizePurchases('alice', 'list');
  assert.ok(state.queue[0].conflict); assert.equal(h.remote.purchases[0].coverage[0].amount, '50');
});
