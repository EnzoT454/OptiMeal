const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function overview({ file = 'app/ListScreen.tsx', empty = false } = {}) {
  const calls = [], navigations = [], loads = [];
  const page = (scope) => ({ items: empty ? [] : scope === 'templates' ? [{ id: 'template', name: 'Semaine', icon: 'leaf' }]
    : Array.from({ length: scope.includes('current') ? 2 : 5 }, (_, i) => ({ id: `${scope}-${i}`, name: `Courses ${i}` })),
    total: empty ? 0 : 6, loading: false, error: '', load: async append => loads.push([scope, append]) });
  const jsx = (type, props) => ({ type, props: props ?? {} }), exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require(name) {
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
test('Liste : créer puis En cours, Historique et Mes modèles ; aucun texte de marque ni panier', () => {
  const h = overview(), tree = h.render(), all = nodes(tree);
  assert.equal(all.find(n => n.type === 'Title').props.children, 'Liste');
  assert.deepEqual(all.filter(n => n.props.accessibilityRole === 'header').map(n => n.props.children), ['En cours', 'Historique', 'Mes modèles']);
  assert.doesNotMatch(text(tree), /OptiMeal|récupérer|Crée, organise/i);
  assert.equal(all.filter(n => n.type === 'Button')[0].props.title, '+ Créer une liste');
  all.find(n => n.props.title === '+ Créer une liste').props.onPress(); assert.deepEqual(h.navigations[0], ['CreateList']);
});
test('historique aperçu : au plus trois listes, filtre serveur limité à trois et lien vers tout', async () => {
  const h = overview(), tree = h.render(), rows = nodes(tree).filter(n => n.type === 'Row');
  assert.equal(rows.filter(n => n.props.list.id.includes('history')).length, 3);
  await h.calls.find(c => c[1] === 'lists:history-preview')[2](0);
  const request = h.calls.find(c => c[0] === 'lists'); assert.equal(request[2], 'history'); assert.equal(request[5], 3);
  nodes(tree).find(n => n.props.accessibilityLabel === 'Voir tout l’historique').props.onPress();
  assert.deepEqual(h.navigations[0], ['History']);
});
test('sections vides : indiquer séparément absence de listes, historique et modèles', () => {
  const tree = overview({ empty: true }).render(), content = text(tree);
  assert.match(content, /Aucune liste en cours/); assert.match(content, /Aucune liste dans l’historique/); assert.match(content, /Aucun modèle enregistré/);
  assert.equal(nodes(tree).some(n => n.props.accessibilityLabel === 'Voir tout l’historique'), false);
});
test('modèle dans Liste : seulement icône et nom, ouverture directe du modèle', () => {
  const h = overview(), tree = h.render();
  const model = nodes(tree).find(n => n.props.accessibilityLabel === 'Ouvrir le modèle Semaine');
  assert.ok(model); assert.match(text(model), /Semaine/); assert.doesNotMatch(text(model), /articles|révision/);
  assert.equal(nodes(model).find(n => n.type === 'Icon').props.name, 'leaf');
  model.props.onPress(); assert.deepEqual(JSON.parse(JSON.stringify(h.navigations[0])), ['TemplateDetail', { id: 'template' }]);
});
test('historique complet : montrer toutes les lignes chargées puis paginer', async () => {
  const h = overview({ file: 'app/ShoppingHistoryScreen.tsx' }), tree = h.render();
  assert.equal(nodes(tree).filter(n => n.type === 'Row').length, 5);
  await nodes(tree).find(n => n.props.title === 'Voir plus').props.onPress(); assert.deepEqual(h.loads[0], ['lists:history', true]);
});


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
    throw new Error(name);
  } });
  let opened = false;
  return { tree: exports.default({ list, onPress: () => { opened = true; } }), opened: () => opened };
}
const listFixture = () => ({ name: 'Courses', status: 'active', purchase_date: '2026-11-21',
  totals: { item_count: 8, remaining_item_count: 2, budget_known_amount: '42.50', remaining_known_amount: '10.00', estimate_complete: true },
  assignment: { stale: false, scenario: { store_totals: [{ retailer: 'maxi', store_id: '1' }, { retailer: 'metro', store_id: '2' }] } },
  product_purchases: [] });
test('résumé compact : mêmes articles, magasins, date des courses et coût total dans En cours et Historique', () => {
  for (const status of ['active', 'completed', 'archived']) {
    const list = { ...listFixture(), status }, h = summary(list);
    const values = nodes(h.tree).filter(n => n.type === 'Text').map(n => n.props.children);
    assert.deepEqual(values, ['Courses', '8', '2', '21/11/2026', '42,50 $']);
    assert.match(h.tree.props.accessibilityLabel, /8 articles.*2 magasins.*2026-11-21.*42,50/);
    assert.doesNotMatch(text(h.tree), /à acheter|Terminée|Archivée|10,00/);
    h.tree.props.onPress(); assert.equal(h.opened(), true);
  }
});
test('résumé magasins : compter chaque magasin une fois, y compris les achats d’un ancien panier', () => {
  const list = listFixture();
  list.product_purchases = ['1', '3', '3'].map(store_id => ({ purchased_units: 1, line: { sale: { raw_source: { retailer: 'maxi', store_id } } } }));
  list.product_purchases.push({ purchased_units: 0, line: { sale: { raw_source: { retailer: 'superc', store_id: '4' } } } });
  assert.match(summary(list).tree.props.accessibilityLabel, /3 magasins/);
  list.assignment.stale = true;
  assert.match(summary(list).tree.props.accessibilityLabel, /2 magasins/);
});
test('résumé prix : distinguer sous-total, prix inconnu et vrai total gratuit', () => {
  const list = listFixture(); list.totals.estimate_complete = false;
  assert.match(text(summary(list).tree), /≥ 42,50/);
  list.totals.budget_known_amount = '0';
  assert.ok(nodes(summary(list).tree).some(n => n.type === 'Text' && n.props.children === '—'));
  assert.match(summary(list).tree.props.accessibilityLabel, /Coût à déterminer/);
  list.totals.estimate_complete = true;
  assert.match(text(summary(list).tree), /0,00/);
});
