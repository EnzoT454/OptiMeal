const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function detail({ visibility = 'private', owned = true, signedIn = true, fail = false, deferred = false } = {}) {
  const recipe = { id: 'recipe_test', name: 'Soupe', description: 'Soupe', visibility, is_owned: owned,
    is_favorite: false, ingredients: [], instructions: [], total_time_minutes: 20, servings: 2, tags: [] };
  const states = [recipe], calls = [], alerts = [];
  let cursor = 0, complete;
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const ui = new Proxy({}, { get: (_, name) => String(name) });
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../app/RecipeDetailScreen.tsx'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require: name => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (name === 'react') return { useCallback: fn => fn, useState(initial) {
      const index = cursor++;
      if (!Object.hasOwn(states, index)) states[index] = initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    } };
    if (name === '@react-navigation/native') return { useFocusEffect() {} };
    if (name === 'react-native') return { Text: 'Text', View: 'View', Alert: { alert: (...args) => alerts.push(args) } };
    if (name.includes('AuthContext')) return { useAuth: () => ({ session: signedIn ? { user: { id: 'alice' } } : null }) };
    if (name.endsWith('services/recipeForm')) return { recipeBadges: () => [], difficultyLabels: {} };
    if (name.endsWith('services/api')) return { api: (url, options) => {
      calls.push({ url, options });
      if (fail) return Promise.reject(new Error('Réseau indisponible'));
      const result = { item: { ...recipe, visibility: JSON.parse(options.body).visibility } };
      return deferred ? new Promise(resolve => { complete = () => resolve(result); }) : Promise.resolve(result);
    } };
    return ui;
  } });
  const render = () => { cursor = 0; return exports.default({ route: { params: { id: recipe.id } }, navigation: {} }); };
  return { render, calls, alerts, states, complete: () => complete() };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const button = (tree, title) => nodes(tree).find(n => n.props?.title === title);
const confirm = d => d.alerts.at(-1)[2].find(action => action.style !== 'cancel').onPress();
const flush = () => new Promise(setImmediate);

for (const visibility of ['private', 'public']) {
  test(`détail ${visibility} : demander confirmation, attendre le serveur et afficher son résultat`, async () => {
    const d = detail({ visibility, deferred: true });
    const title = visibility === 'public' ? 'Rendre privée' : 'Publier la recette';
    button(d.render(), title).props.onPress();
    assert.equal(d.calls.length, 0);
    assert.equal(d.alerts[0][2][0].text, 'Annuler');
    assert.equal(d.alerts[0][2][0].onPress, undefined);
    confirm(d);
    assert.equal(d.calls.length, 1);
    assert.equal(d.calls[0].url, '/api/v1/recipes/recipe_test/visibility');
    assert.equal(d.calls[0].options.method, 'PATCH');
    assert.equal(JSON.parse(d.calls[0].options.body).visibility, visibility === 'public' ? 'private' : 'public');
    assert.equal(d.states[0].visibility, visibility);
    assert.equal(button(d.render(), title).props.disabled, true);
    d.complete(); await flush();
    assert.ok(button(d.render(), visibility === 'public' ? 'Publier la recette' : 'Rendre privée'));
    assert.equal(d.states[3], false);
  });
}

for (const options of [{ owned: false }, { owned: false, signedIn: false }]) {
  test(`recette d’autrui ou initiale : aucune action de publication, session=${!!options.signedIn}`, () => {
    const d = detail({ visibility: 'public', ...options });
    const tree = d.render();
    assert.equal(button(tree, 'Publier la recette'), undefined);
    assert.equal(button(tree, 'Rendre privée'), undefined);
    assert.equal(button(tree, 'Modifier'), undefined);
    assert.equal(d.calls.length, 0);
  });
}

test('échec de publication : conserver le statut affiché et proposer la même action', async () => {
  const d = detail({ fail: true });
  button(d.render(), 'Publier la recette').props.onPress(); confirm(d);
  await flush();
  assert.equal(d.states[0].visibility, 'private');
  assert.equal(d.states[2], 'Réseau indisponible');
  assert.equal(button(d.render(), 'Publier la recette').props.disabled, false);
});

test('pendant un changement, ignorer une nouvelle action de visibilité', () => {
  const d = detail({ deferred: true });
  button(d.render(), 'Publier la recette').props.onPress(); confirm(d);
  button(d.render(), 'Publier la recette').props.onPress();
  assert.equal(d.alerts.length, 1);
  assert.equal(d.calls.length, 1);
  d.complete();
});
