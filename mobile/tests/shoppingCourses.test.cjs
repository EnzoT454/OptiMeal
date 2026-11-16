const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function harness(file, initialProps = {}) {
  let cursor = 0, props = initialProps;
  const hooks = [], cache = new Map(), commands = [], alerts = [];
  const jsx = (type, props) => ({ type, props: props ?? {} });
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename);
    const exports = {}; cache.set(filename, exports);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    }).outputText, { exports, require(name) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'react') return { useState(initial) {
        const index = cursor++; if (!(index in hooks)) hooks[index] = initial;
        return [hooks[index], value => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }];
      } };
      if (name === 'react-native') return { Text: 'Text', View: 'View', Pressable: 'Pressable', Modal: 'Modal', ScrollView: 'ScrollView', Alert: { alert: (...args) => alerts.push(args) } };
      if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
      if (name.endsWith('/recipes')) return { RecipeButton: 'RecipeButton', RecipeField: 'RecipeField', recipeStyles: {}, recipeColors: {} };
      if (name.endsWith('/RecipeUnitPicker')) return { default: 'RecipeUnitPicker', __esModule: true };
      if (name.endsWith('/ListExclusionAction')) return { default: 'ListExclusionAction', __esModule: true };
      if (name.endsWith('/ListComparison')) return { default: 'ListComparison', __esModule: true };
      if (name.endsWith('/shoppingLists')) return {
        listsPath: '/api/v1/shopping-lists', quantityLabel: values => values.map(q => `${q.amount} ${q.unit}`).join(' + '), dateLabel: x => x,
        listCommand: (path, body, method) => ({ key: 'stable-key', path, body, method }),
      };
      const relative = path.resolve(path.dirname(filename), name);
      const target = ['.ts', '.tsx'].map(extension => relative + extension).find(f => fs.existsSync(f));
      if (target) return load(target);
      throw new Error(name);
    }, console });
    return exports;
  }
  const module = load(path.join(__dirname, '..', file));
  const onCommand = async command => { commands.push(command); return true; };
  return { module, commands, alerts,
    render(next = props) { props = next; cursor = 0; return module.default({ onCommand, ...props }); } };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const button = (h, title) => nodes(h.render()).find(n => n.props.title === title);
const field = (h, label) => nodes(h.render()).find(n => n.props.label === label);
const check = h => nodes(h.render()).find(n => n.props.accessibilityRole === 'checkbox');
function fixture() {
  const item = { id: 'rice', name: 'Riz', ingredient_id: 'ing_riz', category: 'Épicerie', required: [{ amount: '1000', unit: 'g' }],
    owned: [], need_revision: 1, owned_unquantified_need_revision: null, contributions: [], removed: false, coverage_status: 'remaining' };
  const line = { sale: { product_id: 'maxi:1:rice', price_basis: 'package', raw_source: { name: 'Riz 500 g', retailer: 'maxi', store_id: '1', format_raw: '500 g' } },
    sale_units: 2, quantity: '1000', amount: '6.00', estimated_weight: false };
  const list = { id: 'list', revision: 8, status: 'active', items: [item], choices: [], purchases: [], product_purchases: [], warnings: [],
    assignment: { comparison_id: 'proposal', stale: false, scenario: { needs: [{ item_ids: ['rice'], lines: [line] }] } } };
  const row = { comparisonId: 'proposal', itemIds: ['rice'], line, purchasedUnits: 0 };
  return { item, line, list, row };
}
const json = v => JSON.parse(JSON.stringify(v));

test('quantités : virgule, décimaux exacts et grande précision sans flottants', () => {
  const q = harness('components/lists/courseQuantities.ts').module;
  assert.equal(q.positiveAmount(' 0,125 '), '0.125');
  for (const bad of ['0', '-1', '1e3', 'NaN', 'Infinity']) assert.equal(q.positiveAmount(bad), null);
  assert.equal(q.subtractAmount('100000000000000000000.000001', ['100000000000000000000']), '0.000001');
  assert.equal(q.subtractAmount('0.3', ['0.1', '0.2']), '0');
  assert.equal(q.subtractAmount('100.000', ['0.001']), '99.999');
  assert.equal(q.subtractAmount('1', ['2']), '0');
});

test('besoin restant : possession et achats sont soustraits une seule fois ; aucune conversion entre dimensions', () => {
  const q = harness('components/lists/courseQuantities.ts').module;
  const { list, item } = fixture();
  item.owned = [{ amount: '200', unit: 'g' }];
  list.purchases = [{ item_id: 'rice', purchased: true, coverage: [{ amount: '100', unit: 'g' }] }];
  list.product_purchases = [{ allocations: [{ item_id: 'rice', quantity: { amount: '500', unit: 'g' } }] }];
  assert.deepEqual(json(q.remainingQuantities(list, item)), [{ unit: 'g', amount: '200' }]);
  assert.deepEqual(json(q.manualCheckCoverage(item)), { quantities: [{ unit: 'g', amount: '800' }] });
  assert.deepEqual(json(q.manualCheckCoverage({ ...item, required: [] })), { confirms_unquantified: true });
});

test('cocher un produit envoie un état cible et aucun prix ; décocher envoie zéro', async () => {
  const props = fixture();
  const h = harness('components/lists/ProductPurchase.tsx', { ...props, disabled: false });
  await check(h).props.onPress();
  assert.equal(h.commands.length, 1);
  assert.deepEqual(json(h.commands[0]), { key: 'stable-key', path: '/api/v1/shopping-lists/list/product-purchases', method: 'PUT',
    body: { expected_revision: 8, comparison_id: 'proposal', item_id: 'rice', product_id: 'maxi:1:rice', purchased_units: 2 } });
  assert.equal(props.list.revision, 8);
  h.render({ ...props, row: { ...props.row, purchasedUnits: 2 }, disabled: false });
  assert.equal(check(h).props.accessibilityState.checked, true);
  await check(h).props.onPress();
  assert.equal(h.commands[1].body.purchased_units, 0);
});

test('quantité de produit : les achats partiels sont explicites, les fractions de paquets sont refusées', async () => {
  const props = fixture();
  const h = harness('components/lists/ProductPurchase.tsx', { ...props, detailed: true, disabled: false });
  field(h, 'Nombre de paquets achetés').props.onChangeText('0.5');
  button(h, 'Enregistrer la quantité achetée').props.onPress();
  assert.equal(h.commands.length, 0);
  field(h, 'Nombre de paquets achetés').props.onChangeText('1');
  await button(h, 'Enregistrer la quantité achetée').props.onPress();
  assert.equal(h.commands[0].body.purchased_units, 1);
});

test('une proposition périmée bloque un nouvel achat ; un achat historique reste décochable', () => {
  const props = fixture(); props.list.assignment.stale = true;
  const h = harness('components/lists/ProductPurchase.tsx', { ...props, disabled: false });
  assert.equal(check(h).props.disabled, true);
  props.list.product_purchases = [{ comparison_id: 'old', item_ids: ['rice'], line: props.line, purchased_units: 1 }];
  h.render({ ...props, row: { ...props.row, comparisonId: 'old', purchasedUnits: 1 }, disabled: false });
  assert.equal(check(h).props.disabled, false);
  assert.equal(check(h).props.accessibilityState.checked, true);
});

test('filtrer les magasins et ouvrir les achats enregistrés ne modifie jamais la liste', () => {
  const { list } = fixture();
  const h = harness('components/lists/ListCourses.tsx', { list, disabled: false });
  button(h, 'Maxi').props.onPress();
  button(h, 'Voir les achats enregistrés').props.onPress();
  assert.equal(button(h, 'Masquer les achats enregistrés').props.accessibilityState.expanded, true);
  assert.equal(h.commands.length, 0);
});

test('fiche : déclarer une possession partielle, puis l’annuler, transmet une couverture de cette liste', async () => {
  const { list, item } = fixture();
  const h = harness('components/lists/ListArticleSheet.tsx', { list, item, disabled: false, onClose() {} });
  button(h, 'J’en ai déjà').props.onPress();
  field(h, 'Quantité en g').props.onChangeText('250,5');
  await button(h, 'Enregistrer la quantité déclarée').props.onPress();
  assert.deepEqual(json(h.commands[0].body), { expected_revision: 8, coverage: { quantities: [{ unit: 'g', amount: '250.5' }] } });
  item.owned = [{ unit: 'g', amount: '250.5' }]; h.render({ list, item, disabled: false });
  await button(h, 'Annuler la possession').props.onPress();
  assert.deepEqual(json(h.commands[1].body), { expected_revision: 8, coverage: {} });
});

test('fiche : un nouveau besoin sans quantité ne réutilise pas une ancienne confirmation', async () => {
  const { list, item } = fixture(); item.required = []; item.need_revision = 2;
  const h = harness('components/lists/ListArticleSheet.tsx', { list, item, disabled: false });
  button(h, 'J’en ai déjà').props.onPress();
  await button(h, 'Confirmer pour ce besoin sans quantité').props.onPress();
  assert.deepEqual(json(h.commands[0].body), { expected_revision: 8, coverage: { confirms_unquantified: true } });
});

test('fiche : erreurs serveur visibles, retrait annulable et quantités achetées préservées quand le besoin change', async () => {
  const { list, item } = fixture();
  const h = harness('components/lists/ListArticleSheet.tsx', { list, item, disabled: false, commandError: 'La liste a changé.' });
  assert.ok(nodes(h.render()).find(n => n.props.accessibilityRole === 'alert'));
  button(h, 'Modifier le besoin').props.onPress();
  field(h, 'Besoin total en g').props.onChangeText('1500');
  await button(h, 'Enregistrer le besoin en g').props.onPress();
  assert.deepEqual(json(h.commands[0].body), { expected_revision: 8, quantity: { amount: '1500', unit: 'g' } });
  button(h, 'Retirer de la liste').props.onPress();
  assert.equal(h.alerts[0][2][0].text, 'Annuler');
  assert.equal(h.commands.length, 1);
});

test('coches locales produit : afficher le dernier état cible sans recalculer les estimations', () => {
  const { list } = fixture();
  const module = harness('components/lists/ProductPurchase.tsx').module;
  const pending = { method: 'PUT', path: '/api/v1/shopping-lists/list/product-purchases', body: {
    comparison_id: 'proposal', product_id: 'maxi:1:rice', item_id: 'rice', purchased_units: 2,
  } };
  const before = json(list);
  const row = module.pendingProductRows(list, [pending])[0];
  assert.equal(row.purchasedUnits, 2); assert.equal(row.pending, true);
  const h = harness('components/lists/ProductPurchase.tsx', { list, row, disabled: false });
  assert.equal(check(h).props.accessibilityState.checked, true);
  assert.match(check(h).props.accessibilityLabel, /en attente/);
  assert.deepEqual(json(list), before);
});
test('fiche hors connexion : bloquer possession et modification, garder les achats produit', () => {
  const { list, item } = fixture();
  const h = harness('components/lists/ListArticleSheet.tsx', { list, item, disabled: false, purchasesOnly: true });
  assert.equal(button(h, 'Modifier le besoin').props.disabled, true);
  assert.equal(button(h, 'J’en ai déjà').props.disabled, true);
  const product = nodes(h.render()).find(n => n.props.row?.comparisonId === 'proposal');
  assert.equal(product.props.disabled, false);
});
test('coches locales manuelles : déplacer dans les achats et décocher avec un état cible', async () => {
  const { list } = fixture(); list.assignment = null;
  const pending = { path: '/api/v1/shopping-lists/list/items/rice/manual-purchase', body: { purchased: true } };
  const h = harness('components/lists/ListCourses.tsx', { list, disabled: false, pendingCommands: [pending] });
  button(h, 'Voir les achats enregistrés').props.onPress();
  assert.equal(check(h).props.accessibilityState.checked, true);
  await check(h).props.onPress();
  assert.equal(h.commands[0].body.purchased, false);
  assert.equal(list.items[0].coverage_status, 'remaining');
});
