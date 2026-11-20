const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function overview({ file = 'app/ListScreen.tsx', empty = false, total = 6 } = {}) {
  const calls = [], navigations = [], loads = [];
  let section = 'recent';
  const page = (scope) => ({ items: empty ? [] : scope === 'templates' ? [{ id: 'template', name: 'Semaine', icon: 'leaf' }]
    : Array.from({ length: scope.includes('current') ? 7 : 5 }, (_, i) => ({ id: `${scope}-${i}`, name: `Courses ${i}` })),
    total: empty ? 0 : total, loading: false, error: '', load: async append => loads.push([scope, append]) });
  const jsx = (type, props) => ({ type, props: props ?? {} }), exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require(name) {
    if (name === 'react') return { useEffect: fn => fn(), useState: () => [section, value => { section = value; }] };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react-native') return { View: 'View', Text: 'Text', Pressable: 'Pressable', ActivityIndicator: 'Spinner' };
    if (name.includes('@expo/vector-icons')) return { __esModule: true, default: 'Icon' };
    if (name.endsWith('/recipes')) return { RecipeButton: 'Button', RecipeScreen: 'Screen', RecipeTitle: 'Title', recipeStyles: {}, recipeColors: {} };
    if (name.endsWith('AuthContext')) return { useAuth: () => ({ session: { user: { id: 'alice' } } }) };
    if (name.endsWith('useShoppingPage')) return { useShoppingPage(scope, fetch) { calls.push(['page', scope, fetch]); return page(scope); } };
    if (name.endsWith('shoppingLists')) return { fetchLists: async (...args) => calls.push(['lists', ...args]) };
    if (name.endsWith('shoppingReuse')) return { fetchTemplates: async (...args) => calls.push(['templates', ...args]) };
    if (name.endsWith('ListSummaryRow')) return { __esModule: true, default: 'Row' };
    throw new Error(name);
  } });
  const render = () => exports.default({ navigation: { navigate: (...args) => navigations.push(args) } });
  return { render, calls, navigations, loads };
}
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
const text = tree => nodes(tree).flatMap(node => [].concat(node.props.children ?? [])).filter(v => typeof v === 'string').join(' ');
test('Liste : deux sections comme Recettes, récentes sélectionnée et création directe', () => {
  const h = overview(), tree = h.render(), all = nodes(tree);
  assert.equal(all.find(n => n.type === 'Title').props.children, 'Listes');
  assert.deepEqual(all.filter(n => n.props.accessibilityRole === 'tab').map(n => [n.props.accessibilityLabel, n.props.accessibilityState.selected]),
    [['Listes récentes', true], ['Mes listes', false]]);
  assert.deepEqual(all.filter(n => n.props.accessibilityRole === 'header').map(n => n.props.children), []);
  assert.doesNotMatch(text(tree), /Mes modèles|Il s’agit de vos listes sauvegardées/);
  all.find(n => n.props.accessibilityLabel === 'Créer une liste').props.onPress(); assert.deepEqual(h.navigations[0], ['CreateList']);
});
test('récentes : cinq lignes au maximum, Voir tout à gauche et aucun historique', async () => {
  const h = overview(), tree = h.render();
  assert.equal(nodes(tree).filter(n => n.type === 'Row').length, 5);
  assert.doesNotMatch(text(tree), /Historique/);
  assert.equal(h.calls.some(c => String(c[1]).includes('history')), false);
  await h.calls.find(c => c[1] === 'lists:current')[2](0);
  const request = h.calls.find(c => c[0] === 'lists'); assert.equal(request[2], 'current'); assert.equal(request[5], 5);
  const more = nodes(tree).find(n => n.props.accessibilityLabel === 'Voir toutes les listes');
  assert.equal(more.props.style.alignSelf, 'flex-start');
  more.props.onPress(); assert.deepEqual(h.navigations[0], ['AllLists']);
  assert.equal(nodes(overview({ total: 5 }).render()).some(n => n.props.accessibilityLabel === 'Voir toutes les listes'), false);
});
test('sections vides : les listes sauvegardées et leur description sont réservées à Mes listes', () => {
  const h = overview({ empty: true }), tree = h.render();
  assert.match(text(tree), /Aucune liste pour le moment/);
  assert.doesNotMatch(text(tree), /Aucune liste sauvegardée|Il s’agit/);
  assert.equal(nodes(tree).some(n => n.props.accessibilityLabel === 'Voir tout l’historique'), false);
  nodes(tree).find(n => n.props.accessibilityLabel === 'Mes listes').props.onPress();
  const saved = h.render();
  assert.match(text(saved), /Il s’agit de vos listes sauvegardées/); assert.match(text(saved), /Aucune liste sauvegardée/);
  assert.doesNotMatch(text(saved), /Aucune liste pour le moment|Mes modèles/);
});
test('Mes listes : ouvrir une liste sauvegardée, pagination, puis revenir aux récentes', async () => {
  const h = overview();
  nodes(h.render()).find(n => n.props.accessibilityLabel === 'Mes listes').props.onPress();
  const tree = h.render(), saved = nodes(tree).find(n => n.props.accessibilityLabel === 'Ouvrir la liste sauvegardée Semaine');
  assert.ok(saved); assert.match(text(saved), /Semaine/);
  assert.equal(nodes(saved).find(n => n.type === 'Icon').props.name, 'leaf');
  assert.equal(nodes(tree).some(n => n.type === 'Row'), false);
  saved.props.onPress(); assert.deepEqual(JSON.parse(JSON.stringify(h.navigations[0])), ['TemplateDetail', { id: 'template' }]);
  await nodes(tree).find(n => n.props.title === 'Voir plus de listes sauvegardées').props.onPress();
  assert.deepEqual(h.loads[0], ['templates', true]);
  nodes(tree).find(n => n.props.accessibilityLabel === 'Listes récentes').props.onPress();
  assert.ok(nodes(h.render()).some(n => n.type === 'Row'));
  assert.doesNotMatch(text(h.render()), /Il s’agit/);
});
test('historique complet : montrer toutes les lignes chargées puis paginer', async () => {
  const h = overview({ file: 'app/ShoppingAllListsScreen.tsx' }), tree = h.render();
  assert.equal(nodes(tree).filter(n => n.type === 'Row').length, 5);
  await nodes(tree).find(n => n.props.title === 'Voir plus').props.onPress(); assert.deepEqual(h.loads[0], ['lists:all', true]);
});


function presentation() {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../services/shoppingPresentation.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, Date, require: () => ({ localDate: () => '2026-11-19' }) });
  return exports;
}
function summary(list) {
  const jsx = (type, props) => ({ type, props: props ?? {} }), exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../components/lists/ListSummaryRow.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require(name) {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react-native') return { View: 'View', Text: 'Text', Pressable: 'Pressable' };
    if (name.includes('@expo/vector-icons')) return { __esModule: true, default: 'Icon' };
    if (name.endsWith('/recipes')) return { recipeStyles: {}, recipeColors: {} };
    if (name.endsWith('shoppingLists')) return { dateLabel: value => value };
    if (name.endsWith('shoppingPresentation')) return presentation();
    throw new Error(name);
  } });
  let opened = false;
  return { tree: exports.default({ list, onPress: () => { opened = true; } }), opened: () => opened };
}
const listFixture = () => ({ kind: 'products', name: 'Courses', status: 'active', purchase_date: '2026-11-21',
  totals: { item_count: 8, remaining_item_count: 2, budget_known_amount: '42.50', remaining_known_amount: '10.00', unpriced_item_count: 1, estimate_complete: true },
  assignment: { stale: false, scenario: { needs: [{ lines: [{ amount: '42.50' }] }] } }, product_purchases: [] });
test('résumé : libellés explicites, articles restants et total du budget', () => {
  const list = listFixture(), h = summary(list);
  assert.equal(nodes(h.tree).some(n => n.props.accessibilityLabel === '8 produits au total'), false);
  assert.ok(nodes(h.tree).some(n => n.props.accessibilityLabel === '2 produits restants à acheter'));
  assert.match(text(h.tree), /Total estimé/); assert.match(text(h.tree), /42,50/);
  assert.doesNotMatch(text(h.tree), /Produits|Articles|En cours/); assert.match(text(h.tree), /42,50/); assert.match(text(h.tree), /\$/);
  assert.equal(nodes(h.tree).some(n => n.props.name === 'currency-usd'), false);
  assert.doesNotMatch(text(h.tree), /10,00|21\/11/);
  h.tree.props.onPress(); assert.equal(h.opened(), true);
});
test('une liste générique ne montre ni prix ni faux zéro, même avec une estimation vide complète', () => {
  const list = listFixture(); list.kind = 'articles'; list.assignment = null;
  list.totals.budget_known_amount = '0';
  assert.equal(presentation().shoppingPriceText(list), null);
  assert.doesNotMatch(text(summary(list).tree), /\$|—|Total|Sous-total/);
});
test('un achat connu conservé contribue au sous-total même si le panier est périmé', () => {
  const list = listFixture(); list.assignment.stale = true; list.totals.estimate_complete = false;
  assert.equal(presentation().shoppingPriceText(list), null);
  list.product_purchases = [{ purchased_units: 1 }];
  assert.match(presentation().shoppingPriceText(list), /Sous-total connu : 42,50.*1 article/);
});
test('un vrai produit gratuit reste distingué de l’absence de choix', () => {
  const list = listFixture(); list.totals.budget_known_amount = '0';
  assert.match(presentation().shoppingPriceText(list), /Total estimé : 0,00/);
});
test('les dates de courses ne sont jamais affichées dans le résumé', () => {
  const list = listFixture(); list.purchase_date = '2026-11-16';
  assert.doesNotMatch(text(summary(list).tree), /En retard|16|nov\.|2026/);
  assert.equal(list.status, 'active');
});


test('magasins : dédupliquer les références, distinguer les succursales et conserver les achats passés', () => {
  const list = listFixture();
  const source = (retailer, store_id) => ({ retailer, store_id });
  list.items = [{ id: 'a' }, { id: 'b' }, { id: 'removed', removed: true }];
  list.choices = [{ item_id: 'a', product_id: 'p1' }, { item_id: 'b', product_id: 'p2' }];
  list.assignment.selected_products = { p1: source('maxi', '1'), p2: source('maxi', '1'), orphan: source('metro', '9') };
  list.assignment.scenario.needs = [{ item_ids: ['a'], lines: [{ sale: { raw_source: source('maxi', '1') } }] },
    { item_ids: ['removed'], lines: [{ sale: { raw_source: source('metro', '9') } }] }];
  list.product_purchases = [{ purchased_units: 1, line: { sale: { raw_source: source('maxi', '2') } } },
    { purchased_units: 0, line: { sale: { raw_source: source('superc', '3') } } }];
  assert.equal(presentation().shoppingStoreCount(list), 2);
  assert.equal(nodes(summary(list).tree).some(n => n.props.accessibilityLabel === '2 magasins'), true);
  list.assignment.stale = true; list.assignment.selected_products = {}; list.product_purchases = [];
  assert.equal(presentation().shoppingStoreCount(list), 0);
});
