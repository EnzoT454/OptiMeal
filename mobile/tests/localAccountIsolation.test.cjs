const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runtime } = require('./helpers/localData.cjs');
const A = 'compte-a', B = 'compte-b';
const oil = { id: 'offer-oil', product_id: 'maxi::oil', retailer: 'maxi', product_name: 'Huile' };
const rice = { id: 'offer-rice', product_id: 'metro::rice', retailer: 'metro', product_name: 'Riz' };
const tick = () => new Promise(resolve => setImmediate(resolve));
const plain = value => JSON.parse(JSON.stringify(value));
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

test('A → B → visiteur → A : le stockage privé et les suivis restent isolés', async () => {
  const r = runtime(), storage = r.load('services/accountStorage.ts'), follows = r.load('components/follows.ts');
  const state = { snapshot: { id: 'list-a', revision: 4 }, queue: [{ key: 'command-a' }] };
  await storage.writeAccountJSON(A, 'test-private.list-a', state);
  await follows.toggleFollow(A, oil);
  const before = [...r.data];
  for (const user of [B, null]) {
    assert.equal(await storage.readAccountJSON(user, 'test-private.list-a', null), null);
    assert.equal((await follows.getFollows(user)).length, 0);
  }
  assert.deepEqual([...r.data], before);
  await storage.writeAccountJSON(B, 'test-private.list-a', { snapshot: { id: 'list-b' }, queue: [] });
  await follows.toggleFollow(B, rice);
  assert.deepEqual(plain(await storage.readAccountJSON(A, 'test-private.list-a', null)), state);
  assert.equal((await follows.getFollows(A))[0].product_id, oil.product_id);
});

test('retirer un suivi de B ne modifie pas ceux de A', async () => {
  const r = runtime(), follows = r.load('components/follows.ts');
  await follows.toggleFollow(A, oil); await follows.unfollow(B, oil.product_id);
  assert.equal((await follows.getFollows(A))[0].product_id, oil.product_id);
  assert.equal((await follows.getFollows(B)).length, 0);
});

test('anciennes clés communes : ni lecture, ni attribution, ni effacement', async () => {
  const r = runtime(), storage = r.load('services/accountStorage.ts'), follows = r.load('components/follows.ts');
  const legacy = {
    'shoppingList.manuels': [{ id: 'old', nom: 'Ancien article' }],
    'shoppingList.coches.2026-11-09': ['riz'], 'shoppingList.dejaLa.2026-11-09': ['huile'],
    'shoppingList.gardeManger': ['sel'], 'shoppingList.choix.2026-11-09': { riz: 'old-product' },
    'shoppingList.magasin': 'maxi', 'optimeal.follows.v2': [{ offer_id: oil.id }],
  };
  for (const [key, value] of Object.entries(legacy)) r.data.set(key, JSON.stringify(value));
  const before = [...r.data];
  for (const user of [A, B, null]) {
    for (const name of Object.keys(legacy)) assert.equal(await storage.readAccountJSON(user, name, null), null);
    assert.equal((await follows.getFollows(user)).length, 0);
  }
  assert.deepEqual([...r.data], before);
  assert.ok(r.reads.every(key => !Object.hasOwn(legacy, key)));
});

test('visiteur : aucune écriture privée ni nouvelle clé anonyme', async () => {
  const r = runtime(), storage = r.load('services/accountStorage.ts'), follows = r.load('components/follows.ts');
  for (const action of [
    () => storage.writeAccountJSON(null, 'test-private.list', {}),
    () => storage.updateAccountJSON(null, 'shopping-command.list', {}, value => value),
    () => follows.toggleFollow(null, oil), () => follows.unfollow(null, oil.id),
  ]) await assert.rejects(action, /Connecte-toi/);
  assert.equal(r.writes.length, 0); assert.equal(r.data.size, 0);
});

test('redémarrage : données privées et suivis retrouvent leur compte propriétaire', async () => {
  const first = runtime();
  await first.load('services/accountStorage.ts').writeAccountJSON(A, 'test-private.list-a', { snapshot: { id: 'list-a' }, queue: [{ key: 'pending' }] });
  await first.load('components/follows.ts').toggleFollow(B, rice);
  const reopened = runtime({ data: first.data }), storage = reopened.load('services/accountStorage.ts');
  assert.equal((await storage.readAccountJSON(A, 'test-private.list-a', null)).queue[0].key, 'pending');
  assert.equal(await storage.readAccountJSON(B, 'test-private.list-a', null), null);
  assert.equal((await reopened.load('components/follows.ts').getFollows(A)).length, 0);
  assert.equal((await reopened.load('components/follows.ts').getFollows(B))[0].product_id, rice.product_id);
});

test('écriture A tardive : rester dans A après le passage à B', async () => {
  const entered = deferred(), release = deferred();
  const r = runtime({ beforeSet: async (key) => { if (key.includes(A)) { entered.resolve(); await release.promise; } } });
  const storage = r.load('services/accountStorage.ts');
  const pending = storage.writeAccountJSON(A, 'test-private.list', { id: 'A' }); await entered.promise;
  r.account(B); await storage.writeAccountJSON(B, 'test-private.list', { id: 'B' });
  release.resolve(); await pending;
  assert.equal((await storage.readAccountJSON(A, 'test-private.list', null)).id, 'A');
  assert.equal((await storage.readAccountJSON(B, 'test-private.list', null)).id, 'B');
});

test('modifications concurrentes : conserver les deux suivis de A et isoler B', async () => {
  const r = runtime(), follows = r.load('components/follows.ts');
  await Promise.all([follows.toggleFollow(A, oil), follows.toggleFollow(A, rice), follows.toggleFollow(B, oil)]);
  assert.deepEqual(Array.from(await follows.getFollows(A), x => x.product_id).sort(), ['maxi::oil', 'metro::rice']);
  assert.deepEqual(Array.from(await follows.getFollows(B), x => x.product_id), ['maxi::oil']);
});

test('une erreur de stockage ne bloque pas les commandes locales suivantes', async () => {
  let fail = true;
  const r = runtime({ beforeSet: () => { if (fail) { fail = false; throw new Error('Disk failure'); } } });
  const storage = r.load('services/accountStorage.ts');
  await assert.rejects(storage.writeAccountJSON(A, 'shopping-command.list', { key: 'failed' }), /Disk failure/);
  await storage.writeAccountJSON(A, 'shopping-command.list', { key: 'saved' });
  assert.equal((await storage.readAccountJSON(A, 'shopping-command.list', null)).key, 'saved');
});
test('suivis déjà affichés : changement de compte et déconnexion les masquent immédiatement', async () => {
  const r = runtime(), f = r.load('components/follows.ts'); await f.toggleFollow(A, oil);
  const h = r.hook('components/useFollows.ts', 'useFollows');
  assert.equal((await h.settled(A)).follows.length, 1);
  assert.equal(h.render(B).follows.length, 0); h.flush(); await tick();
  assert.equal((await h.settled(A)).follows.length, 1);
  assert.equal(h.render(null).follows.length, 0); h.flush(); await tick(); h.unmount();
});

test('hook suivis : une lecture A tardive reste masquée, visiteur demande la connexion', async () => {
  let armed = false; const entered = deferred(), release = deferred();
  const r = runtime({ beforeGet: async key => {
    if (armed && key.includes(A)) { armed = false; entered.resolve(); await release.promise; }
  } });
  const f = r.load('components/follows.ts');
  await f.toggleFollow(A, oil); await f.toggleFollow(B, rice); armed = true;
  const h = r.hook('components/useFollows.ts', 'useFollows');
  h.render(A); h.flush(); await entered.promise;
  assert.equal(h.render(B).follows.length, 0); h.flush(); await tick();
  assert.deepEqual(Array.from(h.render(B).follows, x => x.product_id), [rice.product_id]);
  release.resolve(); await tick();
  assert.deepEqual(Array.from(h.render(B).follows, x => x.product_id), [rice.product_id]);
  const visitor = h.render(null); h.flush(); assert.equal(visitor.follows.length, 0);
  const before = r.writes.length; await visitor.toggle(oil);
  assert.equal(r.writes.length, before); assert.equal(r.prompts.length, 1);
  assert.deepEqual(Array.from((await h.settled(A)).follows, x => x.product_id), [oil.product_id]); h.unmount();
});

test('hook suivis : une écriture A tardive ne remplace pas les suivis B', async () => {
  let armed = false; const entered = deferred(), release = deferred();
  const r = runtime({ beforeSet: async key => {
    if (armed && key.includes(A)) { armed = false; entered.resolve(); await release.promise; }
  } });
  const f = r.load('components/follows.ts'); await f.toggleFollow(B, rice);
  const h = r.hook('components/useFollows.ts', 'useFollows'); const a = await h.settled(A); armed = true;
  const pending = a.toggle(oil); await entered.promise; await h.settled(B);
  release.resolve(); await pending; await tick();
  assert.deepEqual(Array.from(h.render(B).follows, x => x.product_id), [rice.product_id]);
  assert.deepEqual(Array.from((await h.settled(A)).follows, x => x.product_id), [oil.product_id]); h.unmount();
});
