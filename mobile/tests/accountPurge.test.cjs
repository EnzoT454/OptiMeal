const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runtime } = require('./helpers/localData.cjs');
test('suppression confirmée : purger uniquement le compte supprimé et refuser les écritures tardives', async () => {
  const r = runtime(), storage = r.load('services/accountStorage.ts');
  await storage.writeAccountJSON('alice', 'shopping-offline.list', { private: true });
  await storage.writeAccountJSON('bob', 'shopping-offline.list', { private: true });
  r.data.set('shared-legacy', 'keep');
  await storage.purgeAccountStorage('alice');
  assert.equal([...r.data.keys()].some(key => key.includes('.alice.')), false);
  assert.equal((await storage.readAccountJSON('bob', 'shopping-offline.list', null)).private, true);
  assert.equal(r.data.get('shared-legacy'), 'keep');
  await assert.rejects(storage.writeAccountJSON('alice', 'shopping-offline.list', {}), /supprimé/);
});
test('purge attend les écritures déjà lancées et retire aussi leur résultat', async () => {
  let finish;
  const r = runtime({ beforeSet: () => new Promise(resolve => { finish = resolve; }) });
  const storage = r.load('services/accountStorage.ts');
  const write = storage.writeAccountJSON('alice', 'shopping-offline.list', { private: true });
  await new Promise(resolve => setImmediate(resolve));
  const purge = storage.purgeAccountStorage('alice');
  finish(); await write; await purge;
  assert.equal(r.data.size, 0);
});
