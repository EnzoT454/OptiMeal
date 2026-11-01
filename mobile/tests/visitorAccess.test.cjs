const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Même approche sans environnement natif que les tests de services existants :
// rendre les composants avec des ports simulés, puis exercer leurs actions.
function screen(file, { session = null, states = {}, apiFailure = false } = {}) {
  const requests = [], calls = [], navigations = [], effects = [];
  const auth = { session, loading: false, signInReason: null,
    requestSignIn: reason => requests.push(reason), dismissSignIn() {},
    forgotten: 0, async forgetDeletedAccount() { auth.forgotten++; } };
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
  let stateIndex = 0;
  const exports = {};
  const navigator = { Navigator: 'Navigator', Screen: 'Route' };
  const ui = new Proxy({}, { get: (_, name) => name === '__esModule' ? true : String(name) });
  const requireMock = name => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (name === 'react') return { useCallback: fn => fn,
      useState: initial => [Object.hasOwn(states, stateIndex) ? states[stateIndex++] : (stateIndex++, initial), () => {}] };
    if (name.includes('AuthContext')) return { useAuth: () => auth, AuthProvider: 'AuthProvider' };
    if (name.endsWith('services/api')) return { api: (...args) => {
      calls.push(args);
      return apiFailure ? Promise.reject(new Error('Service indisponible')) : Promise.resolve({ items: [] });
    } };
    if (name.endsWith('services/supabase')) return { supabase: {} };
    if (name.endsWith('services/recipeForm')) return { recipeBadges: () => [], difficultyLabels: {} };
    if (name === '@react-navigation/native') return { NavigationContainer: 'NavigationContainer', useFocusEffect: fn => effects.push(fn) };
    if (name === '@react-navigation/native-stack') return { createNativeStackNavigator: () => navigator };
    if (name === '@react-navigation/bottom-tabs') return { createBottomTabNavigator: () => navigator };
    if (name === 'expo-font') return { useFonts: () => [true, null] };
    if (name === 'react-native') return { Text: 'Text', View: 'View', Modal: 'Modal', Alert: { alert() {} } };
    if (name === 'react-native-safe-area-context') return { SafeAreaProvider: 'SafeAreaProvider', SafeAreaView: 'SafeAreaView' };
    if (name === 'expo-status-bar') return { StatusBar: 'StatusBar' };
    if (name.includes('components/ui') || name.includes('components/recipes')) return ui;
    if (name.includes('/app/') || name.startsWith('./app/')) return { __esModule: true, default: name };
    return ui;
  };
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require: requireMock, URLSearchParams });
  const navigation = { navigate: (...args) => navigations.push(args) };
  const render = (props = {}) => (exports.default ?? exports.AccountRequired)({ navigation, ...props });
  return { render, requests, calls, navigations, effects, auth };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  // Content est un composant interne à App ; les écrans de navigation restent
  // des propriétés component et ne sont pas montés pendant cette traversée.
  if (typeof tree.type === 'function') return nodes(tree.type(tree.props));
  return [tree, ...nodes(tree.props?.children)];
}
const button = (tree, title) => nodes(tree).find(n => n.props?.title === title);
const user = { user: { id: 'account-a', email: 'a@example.test' } };

test('sans compte, les cinq onglets sont disponibles sans formulaire de connexion initial', () => {
  const app = screen('App.tsx');
  const rendered = nodes(app.render());
  assert.deepEqual(rendered.filter(n => n.type === 'Route').map(n => n.props.name),
    ['Accueil', 'Promos', 'Recettes', 'Calendrier', 'Paramètres']);
  assert.equal(rendered.some(n => n.type === 'Modal'), false);
  assert.equal(rendered.find(n => n.type === 'NavigationContainer').key, 'visitor');
});

test('fermer la connexion conserve la navigation visiteur, changer de compte la réinitialise', () => {
  const app = screen('App.tsx');
  app.auth.signInReason = 'Ajouter une recette';
  const tree = nodes(app.render());
  const modal = tree.find(n => n.type === 'Modal');
  assert.equal(modal.props.onRequestClose, app.auth.dismissSignIn);
  assert.equal(tree.find(n => n.type === 'NavigationContainer').key, 'visitor');
  const loggedIn = nodes(screen('App.tsx', { session: user }).render());
  assert.equal(loggedIn.find(n => n.type === 'NavigationContainer').key, 'account-a');
});

test('un visiteur doit se connecter avant ajout ou consultation des favoris', () => {
  const list = screen('app/RecipeListScreen.tsx');
  const tree = list.render();
  button(tree, '+  Ajouter une recette').props.onPress();
  nodes(tree).find(n => n.props.label === 'Favoris').props.onPress();
  assert.equal(list.requests.length, 2);
  assert.equal(list.navigations.length, 0);
  assert.equal(list.calls.length, 0);
});

test('un compte connecté peut ouvrir l’ajout de recette', () => {
  const list = screen('app/RecipeListScreen.tsx', { session: user });
  button(list.render(), '+  Ajouter une recette').props.onPress();
  assert.equal(list.navigations[0][0], 'Add');
  assert.equal(list.requests.length, 0);
});

test('un visiteur peut charger et rechercher les recettes partagées sans ouvrir la connexion', async () => {
  const list = screen('app/RecipeListScreen.tsx', { states: { 0: 'poulet' } });
  list.render();
  list.effects.forEach(fn => fn());
  await Promise.resolve();
  assert.equal(list.calls.length, 1);
  const query = new URLSearchParams(list.calls[0][0].split('?')[1]);
  assert.equal(query.get('q'), 'poulet');
  assert.equal(query.has('favorites'), false);
  assert.equal(list.requests.length, 0);
});

test('le formulaire permet de continuer sans compte sans appeler Auth', () => {
  const auth = screen('app/AuthScreen.tsx');
  let cancelled = false;
  const tree = auth.render({ reason: 'Ajouter une recette', onCancel: () => { cancelled = true; } });
  button(tree, 'Continuer sans compte').props.onPress();
  assert.equal(cancelled, true);
  assert.equal(auth.calls.length, 0);
});

test('les écrans personnels sont protégés même en accès direct', () => {
  const gate = screen('components/AccountRequired.tsx');
  const child = { type: 'PrivateEditor', props: {} };
  const tree = gate.render({ reason: 'Ajouter une recette', children: child });
  assert.equal(nodes(tree).some(n => n.type === 'PrivateEditor'), false);
  button(tree, 'Se connecter ou créer un compte').props.onPress();
  assert.deepEqual(gate.requests, ['Ajouter une recette']);
  const signedIn = screen('components/AccountRequired.tsx', { session: user });
  assert.equal(nodes(signedIn.render({ reason: 'Ajouter', children: child })).some(n => n.type === 'PrivateEditor'), true);
});

test('les paramètres visiteur ne lisent pas le profil privé', () => {
  const profile = screen('app/ProfileScreen.tsx');
  const tree = profile.render();
  profile.effects.forEach(fn => fn());
  assert.equal(profile.calls.length, 0);
  assert.equal(button(tree, 'Enregistrer le profil'), undefined);
  button(tree, 'Se connecter ou créer un compte').props.onPress();
  assert.equal(profile.requests.length, 1);
});

test('ajouter un favori sans compte ne déclenche aucune écriture API', async () => {
  const detail = screen('app/RecipeDetailScreen.tsx', { states: { 0: {
    id: 'recipe_demo', name: 'Recette partagée', is_favorite: false,
    ingredients: [], instructions: [], total_time_minutes: 20, servings: 2,
  } } });
  const tree = detail.render({ route: { params: { id: 'recipe_demo' } } });
  await button(tree, 'Ajouter aux favoris').props.onPress();
  assert.equal(detail.requests.length, 1);
  assert.equal(detail.calls.length, 0);
});

test('la suppression du compte est absente pour les visiteurs et demande une confirmation exacte', async () => {
  const visitor = screen('app/ProfileScreen.tsx');
  assert.equal(button(visitor.render(), 'Supprimer mon compte'), undefined);
  const profile = screen('app/ProfileScreen.tsx', { session: user, states: { 3: true, 4: 'oui' } });
  const tree = profile.render();
  assert.equal(button(tree, 'Confirmer la suppression').props.disabled, true);
  button(tree, 'Confirmer la suppression').props.onPress();
  await new Promise(setImmediate);
  assert.equal(profile.calls.length, 0);
  assert.equal(profile.auth.forgotten, 0);
});

test('annuler la suppression ne déclenche pas de requête', () => {
  const profile = screen('app/ProfileScreen.tsx', { session: user, states: { 3: true, 4: 'SUPPRIMER' } });
  button(profile.render(), 'Annuler').props.onPress();
  assert.equal(profile.calls.length, 0);
});

test('le compte connecté est supprimé puis la session locale est effacée', async () => {
  const profile = screen('app/ProfileScreen.tsx', { session: user, states: { 3: true, 4: 'SUPPRIMER' } });
  const confirm = button(profile.render(), 'Confirmer la suppression');
  assert.equal(confirm.props.disabled, false);
  confirm.props.onPress();
  await new Promise(setImmediate);
  assert.equal(profile.calls.length, 1);
  assert.equal(profile.calls[0][0], '/api/v1/me');
  assert.equal(profile.calls[0][1].method, 'DELETE');
  assert.deepEqual(JSON.parse(profile.calls[0][1].body), { confirmation: 'SUPPRIMER' });
  assert.equal(profile.auth.forgotten, 1);
});

test('un échec de suppression ne déconnecte pas le compte', async () => {
  const profile = screen('app/ProfileScreen.tsx', {
    session: user, states: { 3: true, 4: 'SUPPRIMER' }, apiFailure: true,
  });
  button(profile.render(), 'Confirmer la suppression').props.onPress();
  await new Promise(setImmediate);
  assert.equal(profile.auth.forgotten, 0);
});


test('le nouveau calendrier reste protégé par la connexion avant de monter son écran', () => {
  const app = screen('App.tsx');
  const route = nodes(app.render()).find(n => n.type === 'Route' && n.props.name === 'Calendrier');
  const gate = route.props.component();
  assert.equal(gate.type, 'AccountRequired');
  assert.match(gate.props.reason, /Connecte-toi/);
  assert.equal(gate.props.children.type, './app/CalendarScreen');
  assert.equal(app.calls.length, 0);
});
