const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runtime } = require('./helpers/localData.cjs');
const A = 'compte-a';
const meal = (id = 'r1', extra = {}) => ({ recipe_id: id, free_text: null, is_leftover: false,
  date: '2026-11-14', servings: 4, ...extra });
const recipe = id => ({ id, name: 'Riz', servings: 2,
  ingredients: [{ ingredient_id: 'riz', quantity: '100', unit: 'g' }] });
function setup(options = {}) {
  let fail = null;
  const r = runtime({ plan: async () => ({ entries: options.entries ?? [meal()] }),
    api: async path => {
      if (path.startsWith('/api/v1/recipes/')) {
        if (fail) throw fail;
        const id = path.split('/').at(-1);
        return options.recipe ? options.recipe(id, r) : { item: recipe(id) };
      }
      return { items: [], total: 0 };
    }, ...options.storage });
  return { r, fail: value => { fail = value; } };
}
for (const status of [401, 403, 500, 503, 'network']) {
  test(`erreur ${status} : interrompre le chargement complet`, async () => {
    const { r } = setup({ entries: [meal('ok'), meal('ko')], recipe: (id, r) => {
      if (id === 'ko') throw status === 'network' ? new Error('offline') : new r.ApiError(status, 'failed');
      return { item: recipe(id) };
    } });
    await assert.rejects(r.load('components/shoppingList.ts').chargerListe(A));
  });
}
test('404 : signaler chaque repas exclu et garder les bonnes quantités accessibles', async () => {
  const { r } = setup({ entries: [meal('ok'), meal('ko'), meal('ko')], recipe: (id, r) => {
    if (id === 'ko') throw new r.ApiError(404, 'missing');
    return { item: recipe(id) };
  } });
  const liste = await r.load('components/shoppingList.ts').chargerListe(A);
  assert.equal(liste.nbRepasExclus, 2); assert.equal(liste.lignes.length, 1);
  assert.equal(liste.lignes[0].quantites[0].valeur, 200);
});
test('compter les références supprimées, sans compter les notes et restes', async () => {
  const { r } = setup({ entries: [meal(null), meal(null, { free_text: 'Restaurant' }),
    meal(null, { is_leftover: true }), meal('r1', { is_leftover: true })] });
  const liste = await r.load('components/shoppingList.ts').chargerListe(A);
  assert.equal(liste.nbRepasExclus, 1); assert.equal(liste.lignes.length, 0);
});
test('réponse invalide : ne pas la traiter comme une recette absente', async () => {
  const { r } = setup({ recipe: () => ({ item: null }) });
  await assert.rejects(r.load('components/shoppingList.ts').chargerListe(A), /invalide/);
});
test('rafraîchissement échoué : conserver la dernière liste jusqu’à une reprise réussie', async () => {
  const { r, fail } = setup(); const h = r.hook('components/useShoppingList.ts', 'useListeAchats');
  let liste = await h.settled(A); assert.equal(liste.lignes.length, 1); const before = liste.lignes;
  fail(new Error('offline')); await liste.recharger(); liste = h.render(A);
  assert.equal(liste.lignes, before); assert.match(liste.erreurChargement, /conservée/);
  await liste.choisirMagasin('maxi'); liste = h.render(A); assert.match(liste.erreurChargement, /conservée/);
  fail(null); await liste.recharger(); liste = h.render(A);
  assert.equal(liste.erreurChargement, null); assert.equal(liste.lignes.length, 1);
});
test('panne initiale : erreur ; 404 : avertissement même sans aucun ingrédient', async () => {
  const { r, fail } = setup(); fail(new Error('offline'));
  const h = r.hook('components/useShoppingList.ts', 'useListeAchats'); let liste = await h.settled(A);
  assert.match(liste.erreurChargement, /liste complète/);
  fail(new r.ApiError(404, 'missing')); await liste.recharger(); liste = h.render(A);
  assert.equal(liste.erreurChargement, null); assert.match(liste.avertissement, /Liste partielle/);
  assert.equal(liste.lignes.length, 0);
});
test('lecture locale échouée : conserver toute la dernière liste', async () => {
  let blocked = false;
  const { r } = setup({ storage: { beforeGet: () => { if (blocked) throw new Error('disk'); } } });
  const h = r.hook('components/useShoppingList.ts', 'useListeAchats'); let liste = await h.settled(A);
  const before = liste.lignes; blocked = true; await liste.recharger(); liste = h.render(A);
  assert.equal(liste.lignes, before); assert.match(liste.erreurChargement, /conservée/);
});
test('ajout échoué : ni une lecture ni une autre écriture réussie ne masquent l’échec', async () => {
  let blocked = true;
  const { r } = setup({ storage: { beforeSet: () => { if (blocked) throw new Error('disk'); } } });
  const h = r.hook('components/useShoppingList.ts', 'useListeAchats'); let liste = await h.settled(A);
  assert.equal(await liste.ajouter('Pain'), false); liste = h.render(A);
  assert.ok(liste.erreurEnregistrement); assert.equal(liste.lignes.length, 1);
  await liste.recharger(); liste = h.render(A); assert.ok(liste.erreurEnregistrement);
  blocked = false; await liste.choisirMagasin('maxi'); liste = h.render(A); assert.ok(liste.erreurEnregistrement);
  assert.equal(await liste.reessayerEnregistrement(), true); liste = h.render(A);
  assert.equal(liste.erreurEnregistrement, null); assert.ok(liste.lignes.some(l => l.nom === 'Pain'));
});
test('réessayer une coche fixe son état, même si le disque a écrit avant de rejeter', async () => {
  let r, once = true;
  ({ r } = setup({ storage: { beforeSet: (key, value) => {
    if (once) { once = false; r.data.set(key, value); throw new Error('late failure'); }
  } } }));
  const h = r.hook('components/useShoppingList.ts', 'useListeAchats'); let liste = await h.settled(A);
  assert.equal(await liste.basculerCoche('riz'), false); liste = h.render(A);
  await liste.reessayerEnregistrement(); liste = h.render(A); assert.equal(liste.coches.has('riz'), true);
});
test('changer de compte invalide l’action de reprise de l’ancien compte', async () => {
  let blocked = true;
  const { r } = setup({ storage: { beforeSet: () => { if (blocked) throw new Error('disk'); } } });
  const h = r.hook('components/useShoppingList.ts', 'useListeAchats'); let liste = await h.settled(A);
  await liste.ajouter('Secret'); liste = h.render(A); const retry = liste.reessayerEnregistrement;
  liste = await h.settled('compte-b'); blocked = false;
  assert.equal(await retry(), false); assert.equal(await liste.reessayerEnregistrement(), false);
  assert.equal(r.writes.length, 0); assert.equal(liste.erreurEnregistrement, null);
});
