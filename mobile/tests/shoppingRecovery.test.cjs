const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runtime } = require('./helpers/localData.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
const key = (user, name) => `optimeal.accounts.v1.${user}.${name}`;
const A = 'alice', B = 'bob';
const manuals = [{ id: 'rice', nom: 'Riz', ingredient_id: 'ing_rice' }, { id: 'bag', nom: 'Sac' }];
function setup(options = {}) {
  const lists = new Map(), commands = new Map(), exclusions = new Map(), calls = [];
  let nextId = 0, offline = false, lose = '', currentUser = A, missing = false, readFailure = false, r;
  const reject = (status, code) => { const error = new r.ApiError(status, code); error.code = code; throw error; };
  const api = async (path, request = {}, retry, timeout, expectedUser) => {
    calls.push({ path, request, expectedUser });
    if (expectedUser !== currentUser) throw new Error('Account changed');
    if (offline) throw new Error('offline');
    if (path.startsWith('/api/v1/ingredients?')) return { items: [{ id: 'ing_rice', name: 'Riz' }], total: 1 };
    const body = request.body ? JSON.parse(request.body) : null;
    if (!body) { if (readFailure) throw new Error('read lost'); const found = lists.get(path.split('/').pop()); return { item: clone(found) }; }
    const commandKey = `${expectedUser}:${request.headers['Idempotency-Key']}`;
    if (commands.has(commandKey)) {
      assert.equal(commands.get(commandKey).signature, JSON.stringify([path, body]));
      return { item: clone(commands.get(commandKey).result) };
    }
    let result, kind;
    if (path === '/api/v1/shopping-lists') {
      kind = 'create'; result = { id: `list-${++nextId}`, revision: 1, name: body.name, status: 'draft', items: [], purchases: [], product_purchases: [], assignment: null, choices: [] };
      lists.set(result.id, result);
    } else if (path.endsWith('/items')) {
      kind = 'item'; result = lists.get(path.split('/').at(-2));
      if (!result) reject(404, 'NOT_FOUND');
      if (result.revision !== body.expected_revision) reject(409, 'LIST_REVISION_CONFLICT');
      if (missing && body.ingredient_id) reject(404, 'INGREDIENT_NOT_FOUND');
      result.items.push({ name: body.name, ingredient_id: body.ingredient_id ?? null, quantity: body.quantity }); result.revision++;
    } else {
      kind = 'exclusion'; if (missing) reject(404, 'INGREDIENT_NOT_FOUND');
      exclusions.set(path, body.excluded); result = { ingredient_id: path.split('/').pop(), excluded: body.excluded };
    }
    commands.set(commandKey, { result: clone(result), signature: JSON.stringify([path, body]) });
    if (lose === kind) { lose = ''; throw new Error('response lost'); }
    return { item: clone(result) };
  };
  r = runtime({ ...options, api });
  r.data.set(key(A, 'shoppingList.manuels'), JSON.stringify(manuals));
  r.data.set(key(A, 'shoppingList.gardeManger'), JSON.stringify(['ing_rice']));
  const recovery = r.load('services/shoppingRecovery.ts');
  const preview = () => recovery.previewRecovery(A);
  async function begin(includeExclusions = false) {
    const p = await preview();
    return recovery.beginRecovery(A, p, p.items.map(i => i.token), includeExclusions ? p.exclusions.map(i => i.token) : [], 'Récupérés', '2026-11-16');
  }
  return { ...r, recovery, lists, commands, exclusions, calls, preview, begin,
    set offline(value) { offline = value; }, set lose(value) { lose = value; }, set user(value) { currentUser = value; },
    set missing(value) { missing = value; }, set readFailure(value) { readFailure = value; } };
}
test('aperçu privé sans écriture : clés communes et autre compte ignorés', async () => {
  const h = setup();
  h.data.set('shoppingList.manuels', JSON.stringify([{ id: 'old', nom: 'Autre propriétaire' }]));
  h.data.set(key(B, 'shoppingList.manuels'), JSON.stringify([{ id: 'bob', nom: 'Privé' }]));
  const p = await h.preview();
  assert.equal(p.items.length, 2); assert.equal(p.items[0].ingredientId, 'ing_rice');
  assert.equal(p.exclusions[0].name, 'Riz'); assert.equal(h.writes.length, 0); assert.equal(h.lists.size, 0);
  assert.equal(h.reads.includes('shoppingList.manuels'), false);
  assert.equal(h.reads.some(k => k.startsWith(key(B, ''))), false);
});
test('confirmation : besoins sans quantités, aucun achat, prix ou exclusion implicite ; sources conservées', async () => {
  const h = setup(); const original = h.data.get(key(A, 'shoppingList.manuels'));
  await h.begin(); const done = await h.recovery.resumeRecovery(A);
  assert.equal(done.run, null); assert.equal(h.lists.size, 1); assert.equal(h.exclusions.size, 0);
  const list = h.lists.get(done.lastListId);
  assert.equal(list.items.length, 2); assert.ok(list.items.every(i => i.quantity === null));
  assert.deepEqual(list.purchases, []); assert.deepEqual(list.choices, []); assert.equal(list.assignment, null);
  assert.equal(h.data.get(key(A, 'shoppingList.manuels')), original);
  const p = await h.preview(); assert.equal(p.items.length, 0); assert.equal(p.recoveredCount, 2);
});
test('exclusions : conversion uniquement des préférences explicitement choisies, aucun brouillon vide', async () => {
  const h = setup(), p = await h.preview();
  await h.recovery.beginRecovery(A, p, [], [p.exclusions[0].token], 'Préférences', '2026-11-16');
  await h.recovery.resumeRecovery(A);
  assert.equal(h.lists.size, 0); assert.equal(h.exclusions.size, 1);
  assert.equal((await h.preview()).exclusions.length, 0);
});
test('source modifiée entre aperçu et confirmation : refuser et demander un nouvel aperçu', async () => {
  const h = setup(), p = await h.preview();
  h.data.set(key(A, 'shoppingList.manuels'), '[]');
  await assert.rejects(h.recovery.beginRecovery(A, p, p.items.map(i => i.token), [], 'Courses', '2026-11-16'), /changé/);
  assert.equal(h.writes.length, 0); assert.equal(h.lists.size, 0);
});
for (const kind of ['create', 'item', 'exclusion']) test(`réponse perdue après ${kind} : reprendre avec clé et corps identiques`, async () => {
  const h = setup(); await h.begin(true); h.lose = kind;
  await assert.rejects(h.recovery.resumeRecovery(A), /response lost/);
  const pending = clone((await h.recovery.readRecovery(A)).run.pending.command);
  const before = h.calls.filter(call => call.request.headers?.['Idempotency-Key'] === pending.key).length;
  await h.recovery.resumeRecovery(A);
  assert.equal(h.lists.size, 1); assert.equal([...h.lists.values()][0].items.length, 2); assert.equal(h.exclusions.size, 1);
  const retries = h.calls.filter(call => call.request.headers?.['Idempotency-Key'] === pending.key);
  assert.equal(retries.length, before + 1);
  assert.equal(retries[0].request.body, retries.at(-1).request.body);
});
test('fermeture : journal relu depuis un nouveau service, sans changer la commande incertaine', async () => {
  const h = setup(); await h.begin(); h.offline = true;
  await assert.rejects(h.recovery.resumeRecovery(A), /offline/);
  const before = (await h.recovery.readRecovery(A)).run.pending.command;
  const restored = runtime({ data: h.data }).load('services/accountStorage.ts');
  const after = await restored.readAccountJSON(A, 'shopping-recovery.v1', null);
  assert.deepEqual(clone(after.run.pending.command), clone(before));
});
test('conflit après ajout distant : conserver les ajouts distants et utiliser une nouvelle clé après refus', async () => {
  const h = setup(); await h.begin(); h.lose = 'create';
  await assert.rejects(h.recovery.resumeRecovery(A));
  const list = [...h.lists.values()][0]; list.name = 'Nom distant'; list.revision = 4;
  await h.recovery.resumeRecovery(A);
  assert.equal(list.name, 'Nom distant'); assert.equal(list.items.length, 2); assert.equal(list.revision, 6);
  const adds = h.calls.filter(c => c.path.endsWith('/items'));
  assert.notEqual(adds[0].request.headers['Idempotency-Key'], adds[1].request.headers['Idempotency-Key']);
});
test('ingrédient retiré après aperçu : conserver le nom en article libre après refus explicite', async () => {
  const h = setup(); await h.begin(); h.missing = true;
  await h.recovery.resumeRecovery(A);
  assert.equal([...h.lists.values()][0].items[0].ingredient_id, null);
});
test('réessai d’un refus : effacer le statut refusé avant envoi, ne jamais ignorer un résultat devenu incertain', async () => {
  const h = setup(), p = await h.preview();
  await h.recovery.beginRecovery(A, p, [], [p.exclusions[0].token], 'Préférences', '2026-11-16'); h.missing = true;
  await assert.rejects(h.recovery.resumeRecovery(A));
  assert.ok((await h.recovery.readRecovery(A)).run.pending.rejection);
  h.missing = false; h.lose = 'exclusion';
  await assert.rejects(h.recovery.resumeRecovery(A), /response lost/);
  assert.equal((await h.recovery.readRecovery(A)).run.pending.rejection, undefined);
  await assert.rejects(h.recovery.skipRejectedRecoveryItem(A), /vérifier/);
  await h.recovery.resumeRecovery(A); assert.equal(h.exclusions.size, 1);
});
test('échec de sauvegarde locale avant envoi : aucune création réseau', async () => {
  let blocked = false;
  const h = setup({ beforeSet: (key, text) => { if (blocked && text.includes('"pending":{')) throw new Error('disk full'); } });
  await h.begin(); blocked = true;
  await assert.rejects(h.recovery.resumeRecovery(A), /disk full/);
  assert.equal(h.lists.size, 0);
});
test('création acquittée mais sauvegarde locale perdue : replay, sans deuxième brouillon', async () => {
  let blocked = false;
  const h = setup({ beforeSet: (key, text) => { if (blocked && text.includes('"listId":"list-1"')) throw new Error('disk full'); } });
  await h.begin(); blocked = true;
  await assert.rejects(h.recovery.resumeRecovery(A), /disk full/);
  assert.equal(h.lists.size, 1); blocked = false;
  await h.recovery.resumeRecovery(A); assert.equal(h.lists.size, 1);
});
test('double confirmation et reprises concurrentes ne dupliquent pas les données', async () => {
  const h = setup(); await Promise.all([h.begin(), h.begin()]);
  await Promise.all([h.recovery.resumeRecovery(A), h.recovery.resumeRecovery(A)]);
  assert.equal(h.lists.size, 1); assert.equal([...h.lists.values()][0].items.length, 2);
});
test('données corrompues ou identité ambiguë : erreur visible ou avertissement, aucune invention', async () => {
  const h = setup(); h.data.set(key(A, 'shoppingList.manuels'), '{}');
  await assert.rejects(h.preview(), /illisibles/);
  h.data.set(key(A, 'shoppingList.manuels'), JSON.stringify([{ id: 'dup', nom: 'A' }, { id: 'dup', nom: 'B' }, { nom: 'Sans identité' }]));
  const p = await h.preview(); assert.equal(p.items.length, 0); assert.equal(p.warnings.length, 3);
});
test('changement de compte après réponse : arrêt sans nouveau traitement ni attribution au compte suivant', async () => {
  const h = setup(); await h.begin(); let checks = 0;
  await h.recovery.resumeRecovery(A, () => ++checks < 4);
  const saved = await h.recovery.readRecovery(A);
  assert.ok(saved.run); assert.equal(saved.run.pending.kind, 'create');
  h.user = B; const other = await h.recovery.readRecovery(B);
  assert.equal(other.run, null); assert.deepEqual(clone(other.receipts), {});
});
test('nouvelles entrées locales : seules les identités jamais récupérées sont proposées', async () => {
  const h = setup(); await h.begin(); await h.recovery.resumeRecovery(A);
  h.data.set(key(A, 'shoppingList.manuels'), JSON.stringify([...manuals, { id: 'new', nom: 'Lait' }]));
  const p = await h.preview(); assert.equal(p.items.length, 1); assert.equal(p.items[0].name, 'Lait');
});

test('ignorer une préférence refusée ne marque pas sa source comme récupérée', async () => {
  const h = setup(), p = await h.preview();
  await h.recovery.beginRecovery(A, p, [], [p.exclusions[0].token], 'Préférences', '2026-11-16'); h.missing = true;
  await assert.rejects(h.recovery.resumeRecovery(A));
  await h.recovery.skipRejectedRecoveryItem(A);
  const done = await h.recovery.resumeRecovery(A);
  assert.equal(done.run, null); assert.equal((await h.preview()).exclusions.length, 1);
});
test('purge après suppression du compte : retirer aussi journal, reçus et sources privées de récupération', async () => {
  const h = setup(); await h.begin();
  const storage = h.load('services/accountStorage.ts');
  await storage.purgeAccountStorage(A);
  assert.equal([...h.data.keys()].some(k => k.startsWith(key(A, ''))), false);
  await assert.rejects(h.recovery.resumeRecovery(A), /supprimé/);
});
test('refus de session : garder la commande et ne pas proposer de l’ignorer', async () => {
  const h = setup(); await h.begin(); h.user = B;
  await assert.rejects(h.recovery.resumeRecovery(A), /Account changed/);
  const saved = await h.recovery.readRecovery(A);
  assert.equal(saved.run.pending.kind, 'create'); assert.equal(saved.run.pending.rejection, undefined);
  await assert.rejects(h.recovery.skipRejectedRecoveryItem(A), /vérifier/);
  h.user = A; await h.recovery.resumeRecovery(A); assert.equal(h.lists.size, 1);
});
