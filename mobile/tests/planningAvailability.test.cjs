const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function screen(file, { states = {}, reply = { item: { entries: [] } } } = {}) {
  let cursor = 0;
  const effects = [], calls = [], timers = [];
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const native = new Proxy({ StyleSheet: { create: x => x, absoluteFill: {}, hairlineWidth: 1 }, Platform: { OS: 'ios' } },
    { get: (object, name) => object[name] ?? String(name) });
  const api = async (...args) => { calls.push(args); return reply; };
  const react = { useCallback: fn => fn, useEffect: fn => effects.push(fn), useState(initial) {
    const index = cursor++;
    if (!Object.hasOwn(states, index)) states[index] = typeof initial === 'function' ? initial() : initial;
    return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
  } };
  function load(relative) {
    const exports = {};
    const source = fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText, { exports, URLSearchParams,
      setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {},
      require: name => {
        if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
        if (name === 'react') return react;
        if (name === 'react-native') return native;
        if (name.endsWith('services/api')) return { api };
        if (name.endsWith('/planning')) return load('components/planning.ts');
        if (name === '@react-navigation/native') return { useNavigation: () => ({ navigate() {} }), useFocusEffect: fn => effects.push(fn) };
        if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
        return { __esModule: true, default: name };
      } });
    return exports;
  }
  const module = load(file);
  return { render: props => { cursor = 0; return module.default(props); }, effects, calls, timers, states };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  const children = typeof tree.type === 'function' ? tree.type(tree.props) : tree.props?.children;
  return [tree, ...nodes(children)];
}
const content = tree => nodes(tree).flatMap(n => Array.isArray(n.props?.children) ? n.props.children : [n.props?.children]).filter(v => typeof v === 'string').join(' ');
const meal = { id: 'meal_a', date: '2026-11-02', meal: 'souper', servings: 2, recipe_id: 'recipe_a', recipe_name: 'Soupe maison', recipe_image_url: null, free_text: null, is_leftover: false };

for (const fields of [{ recipe_name: null }, { recipe_name: null, recipe_id: null, is_leftover: true }]) {
  test(`recette indisponible (id=${fields.recipe_id === null ? 'supprimée' : 'privée'}) : libellé et actions adaptées`, () => {
    const s = screen('components/MealActionsSheet.tsx');
    const tree = s.render({ repas: { ...meal, ...fields } });
    const labels = nodes(tree).map(n => n.props?.texte).filter(Boolean);
    assert.match(content(tree), /Recette indisponible/);
    assert.equal(labels.includes('Voir la recette'), false);
    assert.equal(labels.includes('Prévoir les restes'), false);
    assert.equal(labels.includes('Dupliquer'), false);
    assert.ok(labels.includes('Déplacer'));
    assert.ok(labels.includes('Retirer du calendrier'));
    assert.ok(nodes(tree).find(n => n.props?.accessibilityLabel === 'Une portion de plus'));
  });
}

test('recette accessible : conserver ouverture, duplication et restes ; notes toujours duplicables', () => {
  for (const entry of [meal, { ...meal, recipe_id: null, recipe_name: null, free_text: 'Resto' }]) {
    const s = screen('components/MealActionsSheet.tsx');
    const tree = s.render({ repas: entry });
    const labels = nodes(tree).map(n => n.props?.texte).filter(Boolean);
    assert.ok(labels.includes('Dupliquer'));
    assert.equal(labels.includes('Voir la recette'), entry.recipe_id !== null);
    assert.equal(labels.includes('Prévoir les restes'), entry.recipe_id !== null);
    assert.doesNotMatch(content(tree), /Recette indisponible/);
  }
});

test('carte calendrier et retour au focus : recharger et remplacer un ancien nom par Recette indisponible', async () => {
  const s = screen('app/CalendarScreen.tsx', { states: { 0: new Date(2026, 10, 2), 1: [meal], 2: false },
    reply: { item: { entries: [{ ...meal, recipe_name: null, recipe_id: null }] } } });
  assert.match(content(s.render()), /Soupe maison/);
  s.effects[0]();
  await new Promise(setImmediate);
  const tree = s.render();
  assert.match(content(tree), /Recette indisponible/);
  assert.doesNotMatch(content(tree), /Soupe maison/);
  assert.equal(s.calls[0][0], '/api/v1/plans?week=2026-11-02');
  assert.equal(s.states[5], null);
});

for (const mode of ['recette', 'favoris']) {
  test(`sélecteur ${mode} : demander uniquement les recettes accessibles et effacer une sélection précédente`, async () => {
    const s = screen('components/AddMealSheet.tsx', { states: { 1: mode, 4: [meal], 5: meal }, reply: { items: [] } });
    s.render({ jour: new Date(2026, 10, 2) });
    s.effects[1]();
    assert.equal(s.states[4].length, 0);
    assert.equal(s.states[5], null);
    s.timers[0]();
    await new Promise(setImmediate);
    const query = new URLSearchParams(s.calls[0][0].split('?')[1]);
    assert.equal(query.get('scope'), mode === 'favoris' ? 'favorites' : 'accessible');
    assert.equal(s.states[4].length, 0);
  });
}
