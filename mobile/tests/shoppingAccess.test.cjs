const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runtime } = require('./helpers/localData.cjs');
const key = (user, name) => `optimeal.accounts.v1.${user}.${name}`;
const list = (id = 'pinned') => ({ id, revision: 4, name: 'Courses', status: 'active', items: [], purchases: [], choices: [], assignment: null });
function setup() {
  const calls = [];
  let failure = null, pin = { list_id: 'pinned' }, value = list();
  const r = runtime({ api: async (...args) => {
    calls.push(args);
    if (failure) throw failure;
    return { item: args[0] === '/api/v1/shopping-list-pin' ? pin : value };
  } });
  return { ...r, calls, service: r.load('services/shoppingAccess.ts'),
    set failure(v) { failure = v; }, set pin(v) { pin = v; }, set value(v) { value = v; } };
}
test('Accueil charge uniquement l’identité épinglée et le même détail, avec compte capturé', async () => {
  const h = setup(); const result = await h.service.loadPinnedList('alice');
  assert.equal(result.id, 'pinned'); assert.equal(result.revision, 4);
  assert.deepEqual(h.calls.map(c => c[0]), ['/api/v1/shopping-list-pin', '/api/v1/shopping-lists/pinned']);
  assert.ok(h.calls.every(c => c[4] === 'alice'));
});
test('aucune liste épinglée : aucun repli vers la dernière liste ou la semaine courante', async () => {
  const h = setup(); h.pin = { list_id: null };
  h.data.set(key('alice', 'shopping-offline.latest'), JSON.stringify('other'));
  const result = await h.service.loadPinnedList('alice');
  assert.equal(result, null); assert.equal(h.calls.length, 1);
});
test('sans réseau : aucun repli sur les anciennes listes locales et aucune écriture de cache', async () => {
  const h = setup(); await h.service.loadPinnedList('alice');
  assert.equal(h.writes.length, 0);
  h.failure = new Error('offline');
  await assert.rejects(h.service.loadPinnedList('alice'), /offline/);
  await assert.rejects(h.service.loadPinnedList('bob'), /offline/);
});
test('préférence serveur retirée : effacer l’accès privé même si un ancien cache existe', async () => {
  const h = setup(); await h.service.loadPinnedList('alice'); h.pin = { list_id: null };
  assert.equal(await h.service.loadPinnedList('alice'), null);
  h.failure = new Error('offline'); await assert.rejects(h.service.loadPinnedList('alice'));
});
test('404/403 ne sont jamais présentés comme un succès hors connexion', async () => {
  const h = setup(); await h.service.loadPinnedList('alice');
  for (const code of [403, 404]) { h.failure = new h.ApiError(code, 'inaccessible'); await assert.rejects(h.service.loadPinnedList('alice'), /inaccessible/); }
});
test('chaque ouverture lit le serveur sans restaurer une ancienne copie du téléphone', async () => {
  const h = setup(); await h.service.loadPinnedList('alice'); h.value = { ...list(), name: 'Courses modifiées' };
  assert.equal((await h.service.loadPinnedList('alice')).name, 'Courses modifiées');
  assert.equal(h.writes.length, 0);
});
test('la période sélectionnée est envoyée avec les filtres avant pagination, sans date implicite', async () => {
  const h = setup(); const service = h.load('services/shoppingLists.ts');
  await service.fetchLists(20, undefined, { start_date: '2027-01-04', end_date: '2027-01-10' }, 'alice');
  const [path, , , , user] = h.calls[0];
  assert.equal(path, '/api/v1/shopping-lists?limit=20&offset=20&start_date=2027-01-04&end_date=2027-01-10');
  assert.equal(user, 'alice');
});
