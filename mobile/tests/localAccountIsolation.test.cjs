const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runtime } = require('./helpers/localData.cjs');
const A = 'compte-a', B = 'compte-b';
const oil = { id: 'offer-oil', product_id: 'maxi::oil', retailer: 'maxi', product_name: 'Huile' };
const rice = { id: 'offer-rice', product_id: 'metro::rice', retailer: 'metro', product_name: 'Riz' };
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

async function snapshot(s, f, account) {
  return JSON.parse(JSON.stringify({
    manuels: (await s.lireManuels(account)).map(x => x.nom),
    coches: [...await s.lireCoches(account)], dejaLa: [...await s.lireDejaLa(account)],
    toujours: [...await s.lireToujours(account)], choix: await s.lireChoix(account),
    magasin: await s.lireMagasin(account), follows: (await f.getFollows(account)).map(x => x.product_id),
  }));
}
const empty = { manuels: [], coches: [], dejaLa: [], toujours: [], choix: {}, magasin: 'auto', follows: [] };

test('A → B → visiteur → A : isoler tous les articles, états, choix et suivis', async () => {
  const r = runtime(), s = r.load('components/shoppingList.ts'), f = r.load('components/follows.ts');
  await s.ajouterManuel(A, 'Article A');
  await s.ecrireCoches(A, new Set(['riz'])); await s.ecrireDejaLa(A, new Set(['huile']));
  await s.ecrireToujours(A, new Set(['sel'])); await s.ecrireChoix(A, { riz: 'produit-a' });
  await s.ecrireMagasin(A, 'maxi'); await f.toggleFollow(A, oil);
  const savedA = await snapshot(s, f, A);
  assert.deepEqual(await snapshot(s, f, B), empty); assert.deepEqual(await snapshot(s, f, null), empty);
  await s.ajouterManuel(B, 'Article B');
  await s.ecrireCoches(B, new Set(['autre'])); await s.ecrireDejaLa(B, new Set(['sucre']));
  await s.ecrireToujours(B, new Set(['poivre'])); await s.ecrireChoix(B, { riz: 'produit-b' });
  await s.ecrireMagasin(B, 'metro'); await f.toggleFollow(B, rice);
  assert.deepEqual(await snapshot(s, f, A), savedA);
  assert.deepEqual((await snapshot(s, f, B)).manuels, ['Article B']);
  assert.deepEqual((await snapshot(s, f, B)).follows, ['metro::rice']);
});

test('les suppressions et bascules du compte B ne changent pas A', async () => {
  const r = runtime(), s = r.load('components/shoppingList.ts'), f = r.load('components/follows.ts');
  const [manual] = await s.ajouterManuel(A, 'Article A');
  await f.toggleFollow(A, oil); await s.basculerCocheStockee(A, 'riz');
  await s.retirerManuel(B, manual.id); await f.unfollow(B, oil.product_id);
  await s.basculerCocheStockee(B, 'riz'); await s.basculerCocheStockee(B, 'riz');
  assert.equal((await s.lireManuels(A))[0].nom, 'Article A');
  assert.equal((await f.getFollows(A))[0].product_id, oil.product_id);
  assert.deepEqual([...await s.lireCoches(A)], ['riz']); assert.deepEqual([...await s.lireCoches(B)], []);
});

test('anciennes clés sans propriétaire : ni lecture, ni attribution au premier compte, ni effacement', async () => {
  const r = runtime(), s = r.load('components/shoppingList.ts'), f = r.load('components/follows.ts');
  for (const [key, value] of Object.entries({
    'shoppingList.manuels': [{ id: 'old', nom: 'Ancien article' }],
    'shoppingList.coches.2026-11-09': ['riz'], 'shoppingList.dejaLa.2026-11-09': ['huile'],
    'shoppingList.gardeManger': ['sel'], 'shoppingList.choix.2026-11-09': { riz: 'old-product' },
    'shoppingList.magasin': 'maxi', 'optimeal.follows.v2': [{ offer_id: oil.id }],
  })) r.data.set(key, JSON.stringify(value));
  const before = [...r.data];
  for (const account of [A, B, null]) assert.deepEqual(await snapshot(s, f, account), empty);
  assert.deepEqual([...r.data], before);
  assert.ok(r.reads.every(key => !before.some(([oldKey]) => oldKey === key)));
});

test('visiteur : aucune écriture personnelle ni nouvelle clé anonyme', async () => {
  const r = runtime(), s = r.load('components/shoppingList.ts'), f = r.load('components/follows.ts');
  for (const action of [
    () => s.ajouterManuel(null, 'Article'), () => s.ecrireCoches(null, new Set(['riz'])),
    () => s.ecrireDejaLa(null, new Set(['riz'])), () => s.ecrireToujours(null, new Set(['sel'])),
    () => s.ecrireChoix(null, {}), () => s.ecrireMagasin(null, 'maxi'),
    () => f.toggleFollow(null, oil), () => f.unfollow(null, oil.id),
  ]) await assert.rejects(action, /Connecte-toi/);
  assert.equal(r.writes.length, 0); assert.equal(r.data.size, 0);
});

test('redémarrage : chaque compte retrouve uniquement ses données', async () => {
  const first = runtime();
  await first.load('components/shoppingList.ts').ajouterManuel(A, 'Article A');
  await first.load('components/follows.ts').toggleFollow(B, rice);
  const reopened = runtime({ data: first.data });
  assert.equal((await reopened.load('components/shoppingList.ts').lireManuels(A))[0].nom, 'Article A');
  assert.equal((await reopened.load('components/shoppingList.ts').lireManuels(B)).length, 0);
  assert.equal((await reopened.load('components/follows.ts').getFollows(A)).length, 0);
  assert.equal((await reopened.load('components/follows.ts').getFollows(B))[0].product_id, rice.product_id);
});

test('écriture A en retard : reste dans A même après passage à B', async () => {
  const entered = deferred(), release = deferred();
  const r = runtime({ beforeSet: async (_key, value) => {
    if (value.includes('Article A')) { entered.resolve(); await release.promise; }
  } });
  const s = r.load('components/shoppingList.ts');
  const pendingA = s.ajouterManuel(A, 'Article A'); await entered.promise;
  r.account(B); await s.ajouterManuel(B, 'Article B');
  release.resolve(); await pendingA;
  assert.equal((await s.lireManuels(A))[0].nom, 'Article A');
  assert.equal((await s.lireManuels(B))[0].nom, 'Article B');
});

test('modifications concurrentes : conserver les deux suivis de A et isoler B', async () => {
  const r = runtime(), f = r.load('components/follows.ts');
  await Promise.all([f.toggleFollow(A, oil), f.toggleFollow(A, rice), f.toggleFollow(B, oil)]);
  assert.deepEqual(Array.from(await f.getFollows(A), x => x.product_id).sort(), ['maxi::oil', 'metro::rice']);
  assert.deepEqual(Array.from(await f.getFollows(B), x => x.product_id), ['maxi::oil']);
});

test('une erreur d’écriture ne bloque pas les opérations suivantes', async () => {
  let fail = true;
  const r = runtime({ beforeSet: async () => { if (fail) { fail = false; throw new Error('Disk failure'); } } });
  const s = r.load('components/shoppingList.ts');
  await assert.rejects(() => s.ajouterManuel(A, 'Échec'), /Disk failure/);
  await s.ajouterManuel(A, 'Réussi');
  assert.deepEqual(Array.from(await s.lireManuels(A), x => x.nom), ['Réussi']);
});

test('coches et choix restent hebdomadaires à l’intérieur de chaque compte', async () => {
  const r = runtime(), s = r.load('components/shoppingList.ts');
  await s.ecrireCoches(A, new Set(['riz'])); await s.modifierChoix(A, 'riz', 'produit-a');
  await s.ecrireToujours(A, new Set(['sel'])); r.week('2026-11-16');
  assert.equal((await s.lireCoches(A)).size, 0); assert.equal(Object.keys(await s.lireChoix(A)).length, 0);
  assert.deepEqual([...await s.lireToujours(A)], ['sel']); r.week('2026-11-09');
  assert.deepEqual([...await s.lireCoches(A)], ['riz']); assert.equal((await s.lireChoix(A)).riz, 'produit-a');
  assert.equal((await s.lireToujours(B)).size, 0);
});

test('hook liste : masquer A immédiatement et ignorer son chargement terminé après B', async () => {
  const release = deferred(); let plans = 0;
  const r = runtime({ plan: () => ++plans === 1 ? release.promise : Promise.resolve({ entries: [] }) });
  const s = r.load('components/shoppingList.ts');
  await s.ajouterManuel(A, 'Article A'); await s.ajouterManuel(B, 'Article B');
  const h = r.hook('components/useShoppingList.ts', 'useListeAchats');
  const oldA = h.render(A); h.flush();
  assert.equal(h.render(B).lignes.length, 0); h.flush(); await tick();
  assert.deepEqual(Array.from(h.render(B).lignes, x => x.nom), ['Article B']);
  release.resolve({ entries: [] }); await tick();
  assert.deepEqual(Array.from(h.render(B).lignes, x => x.nom), ['Article B']);
  await oldA.ajouter('Ancienne action A'); assert.equal((await s.lireManuels(A)).length, 1);
  const before = plans;
  assert.equal(h.render(null).lignes.length, 0); h.flush(); await tick(); assert.equal(plans, before);
  assert.deepEqual(Array.from((await h.settled(A)).lignes, x => x.nom), ['Article A']); h.unmount();
});

test('hook liste déjà affichée : tous les champs personnels sont vides avant les effets du compte B', async () => {
  const r = runtime(), s = r.load('components/shoppingList.ts');
  await s.ajouterManuel(A, 'Article A');
  await s.ecrireCoches(A, new Set(['riz'])); await s.ecrireDejaLa(A, new Set(['huile']));
  await s.ecrireToujours(A, new Set(['sel'])); await s.ecrireChoix(A, { riz: 'produit-a' });
  await s.ecrireMagasin(A, 'metro');
  const h = r.hook('components/useShoppingList.ts', 'useListeAchats');
  const a = await h.settled(A);
  assert.equal(a.lignes.length, 1); assert.equal(a.coches.size, 1); assert.equal(a.magasin, 'metro');
  const b = h.render(B);
  assert.equal(b.lignes.length, 0); assert.equal(b.contexte, null);
  assert.equal(b.coches.size, 0); assert.equal(b.dejaLa.size, 0); assert.equal(b.toujours.size, 0);
  assert.equal(Object.keys(b.choix).length, 0); assert.equal(b.magasinAuto, true);
  h.flush(); await tick(); h.unmount();
});

test('suivis déjà affichés : changement de compte et déconnexion les masquent immédiatement', async () => {
  const r = runtime(), f = r.load('components/follows.ts'); await f.toggleFollow(A, oil);
  const h = r.hook('components/useFollows.ts', 'useFollows');
  assert.equal((await h.settled(A)).follows.length, 1);
  assert.equal(h.render(B).follows.length, 0); h.flush(); await tick();
  assert.equal((await h.settled(A)).follows.length, 1);
  assert.equal(h.render(null).follows.length, 0); h.flush(); await tick(); h.unmount();
});

test('hook liste : une mutation terminée sous B ne réaffiche pas les articles A', async () => {
  let armed = false; const entered = deferred(), release = deferred();
  const r = runtime({ beforeSet: async (_key, value) => {
    if (armed && value.includes('Ajout A')) { entered.resolve(); await release.promise; }
  } });
  const s = r.load('components/shoppingList.ts'); await s.ajouterManuel(B, 'Article B');
  const h = r.hook('components/useShoppingList.ts', 'useListeAchats');
  const a = await h.settled(A); armed = true;
  const pending = a.ajouter('Ajout A'); await entered.promise; await h.settled(B);
  release.resolve(); await pending; await tick();
  assert.deepEqual(Array.from(h.render(B).lignes, x => x.nom), ['Article B']);
  assert.deepEqual(Array.from((await h.settled(A)).lignes, x => x.nom), ['Ajout A']); h.unmount();
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
