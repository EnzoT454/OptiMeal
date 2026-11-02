const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function screen({ signedIn = true, respond = () => Promise.resolve({ items: [], total: 0 }) } = {}) {
  const states = [], calls = [], signIns = [], navigations = [];
  let cursor = 0, effect, cleanup;
  const auth = { session: signedIn ? { user: { id: 'alice' } } : null, requestSignIn: message => signIns.push(message) };
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const ui = new Proxy({}, { get: (_, name) => String(name) });
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../app/RecipeListScreen.tsx'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, URLSearchParams, require: name => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (name === 'react') return { useCallback: fn => fn, useState(initial) {
      const index = cursor++;
      if (!Object.hasOwn(states, index)) states[index] = initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    } };
    if (name === '@react-navigation/native') return { useFocusEffect: fn => { effect = fn; } };
    if (name.includes('AuthContext')) return { useAuth: () => auth };
    if (name.endsWith('services/api')) return { api: url => { calls.push(url); return respond(url); } };
    return ui;
  } });
  const render = () => { cursor = 0; return exports.default({ navigation: { navigate: (...args) => navigations.push(args) } }); };
  const focus = () => { if (cleanup) cleanup(); cleanup = effect(); };
  const load = async () => { render(); focus(); await new Promise(setImmediate); return render(); };
  return { render, focus, load, calls, signIns, navigations, auth };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const tab = (tree, label) => nodes(tree).find(n => n.props?.accessibilityRole === 'tab' && n.props.accessibilityLabel === label);
const button = (tree, title) => nodes(tree).find(n => n.props?.title === title);
const field = tree => nodes(tree).find(n => n.props?.label === 'Rechercher');
const chip = (tree, label) => nodes(tree).find(n => n.props?.label === label);
const params = url => new URLSearchParams(url.split('?')[1]);
const content = tree => nodes(tree).flatMap(n => Array.isArray(n.props?.children) ? n.props.children : [n.props?.children]).filter(v => typeof v === 'string').join(' ');
const recipe = { id: 'recipe_a', name: 'Soupe', servings: 2, total_time_minutes: 20, visibility: 'private', is_owned: true, published_at: null };

test('Découvrir par défaut et sections personnelles protégées pour un visiteur', async () => {
  const s = screen({ signedIn: false });
  const tree = await s.load();
  assert.equal(nodes(tree).filter(n => n.props?.accessibilityRole === 'tab').length, 3);
  assert.equal(tab(tree, 'Découvrir').props.accessibilityState.selected, true);
  assert.equal(params(s.calls[0]).get('scope'), 'discover');
  tab(tree, 'Mes recettes').props.onPress();
  tab(tree, 'Favoris').props.onPress();
  assert.equal(s.signIns.length, 2);
  assert.equal(tab(s.render(), 'Découvrir').props.accessibilityState.selected, true);
  assert.equal(s.calls.length, 1);
  assert.equal(chip(tree, 'Favoris'), undefined);
});

test('recherche, Rapides et pagination restent dans la section active ; changer de section réinitialise la page', async () => {
  const s = screen({ respond: () => Promise.resolve({ items: [recipe], total: 45 }) });
  let tree = await s.load();
  tab(tree, 'Mes recettes').props.onPress();
  tree = await s.load();
  assert.equal(params(s.calls.at(-1)).get('scope'), 'mine');
  assert.ok(chip(tree, 'Privée'));
  assert.match(content(tree), /Par vous/);
  field(tree).props.onChangeText('soupe');
  tree = await s.load();
  chip(tree, 'Rapides').props.onPress();
  tree = await s.load();
  button(tree, 'Page suivante').props.onPress();
  tree = await s.load();
  let query = params(s.calls.at(-1));
  assert.equal(query.get('scope'), 'mine');
  assert.equal(query.get('q'), 'soupe');
  assert.equal(query.get('quick'), 'true');
  assert.equal(query.get('offset'), '20');
  tab(tree, 'Favoris').props.onPress();
  assert.doesNotMatch(content(s.render()), /Soupe/);
  tree = await s.load();
  query = params(s.calls.at(-1));
  assert.equal(query.get('scope'), 'favorites');
  assert.equal(query.get('offset'), '0');
  assert.equal(query.get('q'), 'soupe');
  assert.equal(query.get('quick'), 'true');
  assert.equal(query.has('favorites'), false);
  assert.equal(chip(tree, 'Privée'), undefined);
});

test('états vides : créer sa première recette, découvrir depuis Favoris et effacer une recherche', async () => {
  const s = screen();
  let tree = await s.load();
  tab(tree, 'Mes recettes').props.onPress();
  tree = await s.load();
  button(tree, 'Ajouter ma première recette').props.onPress();
  assert.equal(s.navigations[0][0], 'Add');
  tab(tree, 'Favoris').props.onPress();
  tree = await s.load();
  button(tree, 'Découvrir des recettes').props.onPress();
  tree = await s.load();
  assert.equal(params(s.calls.at(-1)).get('scope'), 'discover');
  field(tree).props.onChangeText('introuvable');
  tree = await s.load();
  button(tree, 'Effacer la recherche et les filtres').props.onPress();
  await s.load();
  assert.equal(params(s.calls.at(-1)).get('q'), '');
});

test('recettes publiées de soi, de la communauté et de l’app : source et badge explicites', async () => {
  const s = screen({ respond: () => Promise.resolve({ items: [
    { ...recipe, visibility: 'public', published_at: '2026-11-01T12:00:00Z' },
    { ...recipe, id: 'recipe_b', is_owned: false, visibility: 'public', published_at: '2026-11-01T12:00:00Z' },
    { ...recipe, id: 'recipe_c', is_owned: false, visibility: 'public' },
  ], total: 3 }) });
  let tree = await s.load();
  assert.match(content(tree), /Par vous/);
  assert.match(content(tree), /Par la communauté/);
  assert.match(content(tree), /Par OptiMeal/);
  tab(tree, 'Mes recettes').props.onPress();
  tree = await s.load();
  assert.ok(chip(tree, 'Publique'));
});

test('une réponse de la section précédente est ignorée après changement', async () => {
  let finish;
  const s = screen({ respond: url => params(url).get('scope') === 'discover'
    ? new Promise(resolve => { finish = resolve; })
    : Promise.resolve({ items: [recipe], total: 1 }) });
  let tree = s.render(); s.focus();
  tab(tree, 'Mes recettes').props.onPress();
  tree = await s.load();
  assert.match(content(tree), /Soupe/);
  finish({ items: [{ ...recipe, name: 'Ancienne réponse' }], total: 100 });
  await new Promise(setImmediate);
  tree = s.render();
  assert.match(content(tree), /Soupe/);
  assert.doesNotMatch(content(tree), /Ancienne réponse/);
});

test('réessayer et revenir sur l’écran rechargent la même section ; Petit budget conserve son attente', async () => {
  let fail = false;
  const s = screen({ respond: () => fail ? Promise.reject(new Error('Réseau indisponible')) : Promise.resolve({ items: [], total: 0 }) });
  let tree = await s.load();
  tab(tree, 'Favoris').props.onPress(); fail = true;
  tree = await s.load();
  assert.ok(button(tree, 'Réessayer'));
  fail = false; button(tree, 'Réessayer').props.onPress();
  tree = await s.load();
  assert.equal(params(s.calls.at(-1)).get('scope'), 'favorites');
  await s.load();
  assert.equal(params(s.calls.at(-1)).get('scope'), 'favorites');
  chip(tree, 'Petit budget').props.onPress();
  const before = s.calls.length;
  tree = await s.load();
  assert.equal(s.calls.length, before);
  assert.match(content(tree), /Disponible prochainement/);
});
