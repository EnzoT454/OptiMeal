const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runtime } = require('./helpers/localData.cjs');
const A = 'compte-a', B = 'compte-b';
const old = { id: 'offer_old', product_id: 'maxi:1:123', retailer: 'maxi', product_name: 'Huile',
  price: { amount: '10' }, promo_price: null, promotion: { status: 'not_promotion' } };
const fresh = { ...old, id: 'offer_new', price: { amount: '12' }, promo_price: { amount: '7.77' },
  retrieved_at: '2026-11-15', promotion: { status: 'active' } };
const plain = v => JSON.parse(JSON.stringify(v));
const key = (user, name) => `optimeal.accounts.v1.${user}.${name}`;
const followsKey = user => key(user, 'optimeal.follows.v2');

test('suivre, actualiser prix/date, redémarrer, compter la promo puis arrêter le même produit', async () => {
  const r = runtime({ isOnPromo: o => o.promotion.status === 'active' });
  const f = r.load('components/follows.ts'); await f.toggleFollow(A, old);
  const reopened = runtime({ data: r.data, isOnPromo: o => o.promotion.status === 'active' });
  const service = reopened.load('components/follows.ts'), saved = await service.getFollows(A, [fresh]);
  assert.equal(saved[0].product_id, old.product_id); assert.equal(saved[0].offer_id, undefined);
  assert.equal(service.followsOffer(saved[0], fresh), true);
  assert.equal(service.followedOnPromo(saved, [fresh, fresh]), 1);
  assert.equal((await service.toggleFollow(A, fresh)).length, 0);
});
test('même nom : distinguer référence, enseigne et magasin', async () => {
  const r = runtime(), f = r.load('components/follows.ts');
  await f.toggleFollow(A, old); const [saved] = await f.getFollows(A);
  for (const other of [{ ...fresh, product_id: 'maxi:1:456' },
    { ...fresh, product_id: 'maxi:2:123' }, { ...fresh, retailer: 'metro', product_id: 'metro:1:123' }]) {
    assert.equal(f.followsOffer(saved, other), false); await f.toggleFollow(A, other);
  }
  assert.equal((await f.getFollows(A)).length, 4);
});
test('migration exacte des anciens suivis, sans fusion par nom ni perte des introuvables', async () => {
  const legacy = { offer_id: old.id, retailer: old.retailer, name: old.product_name, since: '2026-10-01' };
  const lost = { ...legacy, offer_id: 'offer_lost' };
  const r = runtime(); r.data.set(followsKey(A), JSON.stringify([legacy, lost]));
  const f = r.load('components/follows.ts');
  const migrated = await f.getFollows(A, [old]);
  assert.equal(migrated[0].product_id, old.product_id); assert.equal(migrated[0].since, legacy.since);
  assert.deepEqual(plain(migrated[1]), lost);
  const after = await f.getFollows(A, [fresh]); assert.equal(f.followsOffer(after[0], fresh), true);
  assert.equal(f.followsOffer(after[1], fresh), false);
  await f.unfollow(A, f.followKey(after[1])); assert.equal((await f.getFollows(A)).length, 1);
  assert.equal((await f.getFollows(B)).length, 0);
});
test('conversion déduplique un suivi ancien et stable du même produit', async () => {
  const r = runtime(); r.data.set(followsKey(A), JSON.stringify([
    { offer_id: old.id, retailer: 'maxi', name: 'Huile', since: '2026-10-01' },
    { product_id: old.product_id, retailer: 'maxi', name: 'Huile', since: '2026-11-01' },
  ]));
  const list = await r.load('components/follows.ts').getFollows(A, [old]);
  assert.equal(list.length, 1); assert.equal(list[0].since, '2026-10-01');
});
test('échec de conversion : garder la donnée et permettre la reprise', async () => {
  let blocked = true;
  const r = runtime({ beforeSet: () => { if (blocked) throw new Error('disk'); } });
  const legacy = [{ offer_id: old.id, retailer: 'maxi', name: 'Huile', since: '2026-10-01' }];
  r.data.set(followsKey(A), JSON.stringify(legacy)); const f = r.load('components/follows.ts');
  await assert.rejects(f.getFollows(A, [old]), /disk/);
  assert.deepEqual(JSON.parse(r.data.get(followsKey(A))), legacy);
  blocked = false; assert.equal((await f.getFollows(A, [old]))[0].product_id, old.product_id);
});
test('choix manuel : conserver le produit malgré un autre moins cher et une nouvelle offre', async () => {
  const r = runtime(), s = r.load('components/shoppingList.ts');
  await s.modifierChoix(A, 'huile', old.product_id);
  const choices = await s.lireChoix(A), line = { ingredient_id: 'huile', offres: [
    { ...fresh, id: 'offer_cheaper', product_id: 'maxi:1:456', price: { amount: '1' }, promo_price: null }, fresh] };
  assert.equal(s.offreDeLigne(line, 'maxi', choices).product_id, old.product_id);
  assert.equal((await s.lireChoix(B)).huile, undefined);
  await s.modifierChoix(A, 'huile', null); assert.equal((await s.lireChoix(A)).huile, undefined);
});
test('migration des choix : convertir seulement une correspondance exacte et persister par compte/semaine', async () => {
  const r = runtime(), s = r.load('components/shoppingList.ts');
  await s.ecrireChoix(A, { huile: old.id, autre: 'offer_lost' });
  assert.deepEqual(plain(await s.lireChoix(A, [old])), { huile: old.product_id, autre: 'offer_lost' });
  assert.equal((await s.lireChoix(A, [fresh])).huile, old.product_id);
  assert.equal((await s.lireChoix(B, [old])).huile, undefined);
  r.week('2026-11-16'); assert.equal((await s.lireChoix(A, [old])).huile, undefined);
});

test('fiche article : le produit le moins cher est aussi enregistré par product_id ; retour automatique possible', () => {
  const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
  const exports = {}, jsx = (type, props) => ({ type, props });
  const shopping = runtime().load('components/shoppingList.ts');
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../components/ArticleSheet.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require(name) {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react-native') return { Pressable: 'Pressable', Text: 'Text', View: 'View', Modal: 'Modal',
      StyleSheet: { create: x => x } };
    if (name.endsWith('/shoppingList')) return shopping;
    if (name.endsWith('/recipes')) return { recipeColors: {} };
    if (name.endsWith('/promos')) return { money: String, storeName: String, quantityPriceCondition: () => null };
    return { __esModule: true, default: 'Icon' };
  } });
  const offer = { ...fresh, format: {} };
  const calls = [], line = { ingredient_id: 'huile', catalogue_id: 'huile', nom: 'Huile', offres: [offer], pour: [] };
  const tree = exports.default({ ligne: line, quantite: '', onClose() {}, liste: {
    dejaLa: new Set(), toujours: new Set(), choix: { huile: old.product_id }, magasin: 'maxi',
    offreDe: () => offer, choisirProduit: (...args) => calls.push(args),
  } });
  function nodes(tree) {
    if (!tree || typeof tree !== 'object') return [];
    if (Array.isArray(tree)) return tree.flatMap(nodes);
    return [tree, ...nodes(tree.props?.children)];
  }
  nodes(tree).find(n => n.props?.accessibilityRole === 'radio').props.onPress();
  assert.deepEqual(calls[0], ['huile', old.product_id]);
  nodes(tree).find(n => n.type === 'Pressable' && nodes(n).some(child =>
    child.props?.children === 'Choisir automatiquement le moins cher')).props.onPress();
  assert.deepEqual(calls[1], ['huile', null]);
});
