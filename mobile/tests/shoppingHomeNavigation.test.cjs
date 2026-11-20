const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const flush = () => new Promise(setImmediate);
function load(file, requireMock) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: requireMock, Date });
  return exports;
}
test('Accueil : toucher une liste cible son détail dans Listes, avec un retour vers les récentes', async () => {
  const slots = [], effects = [], parentCalls = [], localCalls = [], reads = [];
  let cursor = 0, lastFocus;
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const navigation = { navigate: (...args) => localCalls.push(args), getParent: () => ({ navigate: (...args) => parentCalls.push(args) }) };
  const rec = async () => {};
  const iso = value => value.toISOString().slice(0, 10);
  const resource = { id: 'specific-list', name: 'Liste demandée', status: 'active', purchase_date: '2000-01-01' };
  const destination = load('services/shoppingNavigation.ts', () => { throw new Error('Unexpected import'); });
  const app = load('app/HomeScreen.tsx', name => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (name === 'react') return {
      useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, value => { slots[i].value = value; }]; },
      useCallback(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((v, n) => v !== slots[i].deps[n])) slots[i] = { fn, deps }; return slots[i].fn; },
    };
    if (name === '@react-navigation/native') return { useNavigation: () => navigation, useFocusEffect: fn => { if (fn !== lastFocus) { lastFocus = fn; effects.push(fn); } } };
    if (name === 'react-native') return { Text: 'Text', View: 'View', Pressable: 'Pressable', Image: 'Image', ScrollView: 'ScrollView', ActivityIndicator: 'Spinner', StyleSheet: { create: x => x } };
    if (name.includes('@expo/vector-icons')) return { __esModule: true, default: 'Icon' };
    if (name.endsWith('AuthContext')) return { useAuth: () => ({ session: { user: { id: 'alice' } } }) };
    if (name.endsWith('/recipes')) return { RecipeScreen: 'Screen', recipeColors: {}, recipeStyles: {} };
    if (name.endsWith('/planning')) return { MEALS: [], MEAL_COLORS: {}, MEAL_LABELS: {}, dayFullName: () => 'Jeudi', getPlan: async () => ({ entries: [] }), mondayOf: x => x, toISODate: iso };
    if (name.endsWith('ListSummaryRow')) return { __esModule: true, default: 'ListRow' };
    if (name.endsWith('shoppingNavigation')) return destination;
    if (name.endsWith('shoppingLists')) return { fetchLists: async (...args) => { reads.push(args); return { items: [resource, { ...resource, id: 'closed', status: 'completed' }] }; } };
    if (name.endsWith('/promos')) return { storeName: x => x };
    if (name.endsWith('/search')) return { fetchAllOffers: async () => [], isOnPromo: () => false };
    if (name.endsWith('/follows')) return { followsOffer: () => false };
    if (name.endsWith('/useFollows')) return { useFollows: () => ({ follows: [], recharger: rec }) };
    if (name.endsWith('/MenuCompte')) return { __esModule: true, default: 'Menu' };
    throw new Error(name);
  });
  function nodes(tree) {
    if (!tree || typeof tree !== 'object') return [];
    if (Array.isArray(tree)) return tree.flatMap(nodes);
    if (typeof tree.type === 'function') return nodes(tree.type(tree.props));
    return [tree, ...nodes(tree.props.children)];
  }
  const render = () => { cursor = 0; return nodes(app.default({ navigation })); };
  render(); effects.splice(0).forEach(fn => fn()); await flush();
  const rows = render().filter(n => n.type === 'ListRow');
  assert.equal(reads[0][1], 'current'); assert.equal(rows.length, 1);
  rows[0].props.onPress();
  assert.equal(localCalls.length, 0); assert.equal(parentCalls[0][0], 'Liste');
  const state = JSON.parse(JSON.stringify(parentCalls[0][1].state));
  assert.equal(state.index, 1);
  assert.deepEqual(state.routes, [{ name: 'Lists', params: { section: 'recent' } }, { name: 'ShoppingDetail', params: { id: 'specific-list' } }]);
});
