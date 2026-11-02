const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function editor({ localPhoto = null, savedPhoto = null, uploadFails = false, name = 'Recette test', id, visibility = 'private', failures = {}, loadedRecipe } = {}) {
  const calls = [], uploads = [], navigation = [], alerts = [], effects = [];
  let storedVisibility = visibility;
  const states = { 0: [{ id: 'ing_test', name: 'Ingrédient' }], 1: name,
    8: savedPhoto, 9: localPhoto, 10: [{ ingredient_id: 'ing_test', quantity: '100', unit: 'g', preparation: null }],
    11: ['Préparer.'], 16: false, 19: visibility, 20: visibility };
  let cursor = 0;
  const exports = {};
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const ui = new Proxy({}, { get: (_, name) => name === '__esModule' ? true : String(name) });
  const form = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../services/recipeForm.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: form });
  const requireMock = name => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (name === 'react') return { useEffect(fn) { effects.push(fn); }, useState(initial) {
      const index = cursor++;
      if (!Object.hasOwn(states, index)) states[index] = initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    } };
    if (name === 'react-native') return { Text: 'Text', View: 'View', Pressable: 'Pressable',
      Switch: 'Switch', KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'ios' }, Alert: { alert: (...args) => alerts.push(args) } };
    if (name.endsWith('services/recipeForm')) return form;
    if (name.endsWith('services/recipeImages')) return {
      chooseRecipeImage: async () => null,
      uploadRecipeImage: async uri => {
        uploads.push(uri);
        if (uploadFails) throw new Error('Envoi impossible');
        return 'https://example.supabase.co/photo.jpg';
      },
    };
    if (name.endsWith('services/api')) return { api: async (...args) => {
      calls.push(args);
      const method = args[1]?.method ?? 'GET';
      if (failures[method] > 0) { failures[method]--; throw new Error('Erreur réseau simulée'); }
      if (method === 'GET') return args[0].includes('ingredients') ? { items: states[0] } : { item: loadedRecipe };
      if (method === 'POST' || method === 'PATCH') storedVisibility = JSON.parse(args[1].body).visibility;
      return { item: { id: id ?? 'recipe_created', visibility: storedVisibility } };
    } };
    return ui;
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../app/RecipeEditorScreen.tsx'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, require: requireMock });
  const render = () => { cursor = 0; return exports.default({ route: { params: id ? { id } : undefined },
    navigation: { reset: value => navigation.push(value) } }); };
  return { tree: render(), render, calls, uploads, navigation, states, alerts, effects };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const saveButton = tree => nodes(tree).find(n => n.props?.title === 'Enregistrer la recette');
const flush = () => new Promise(setImmediate);

for (const name of ['', '   ']) {
  for (const id of [undefined, 'recipe_existing']) {
    test(`nom ${JSON.stringify(name)}, ${id ? 'édition' : 'création'} : bloquer même avec une photo`, async () => {
      const e = editor({ name, id, localPhoto: 'file:///photo.jpg' });
      const save = saveButton(e.tree);
      assert.equal(save.props.disabled, true);
      save.props.onPress();
      await flush();
      assert.equal(e.calls.length, 0);
      assert.equal(e.uploads.length, 0);
      assert.equal(e.navigation.length, 0);
      assert.match(e.states[17], /Ajoute un nom/);
    });
  }
}

test('nouvelle recette sans photo : bouton désactivé et aucun envoi même en appel direct', async () => {
  const e = editor();
  const save = saveButton(e.tree);
  assert.equal(save.props.disabled, true);
  save.props.onPress();
  await flush();
  assert.equal(e.calls.length, 0);
  assert.equal(e.uploads.length, 0);
  assert.match(e.states[17], /Ajoute une photo/);
});

test('photo choisie : envoyer l’image avant de créer avec son URL', async () => {
  const e = editor({ localPhoto: 'file:///photo.jpg' });
  assert.equal(saveButton(e.tree).props.disabled, false);
  saveButton(e.tree).props.onPress();
  await flush();
  assert.deepEqual(e.uploads, ['file:///photo.jpg']);
  assert.equal(e.calls.length, 1);
  assert.equal(e.calls[0][1].method, 'POST');
  assert.equal(JSON.parse(e.calls[0][1].body).image_url, 'https://example.supabase.co/photo.jpg');
  assert.equal(e.navigation.length, 1);
});

test('échec Storage : ne pas créer, conserver la photo pour réessayer', async () => {
  const e = editor({ localPhoto: 'file:///photo.jpg', uploadFails: true });
  saveButton(e.tree).props.onPress();
  await flush();
  assert.equal(e.calls.length, 0);
  assert.equal(e.states[9], 'file:///photo.jpg');
  assert.equal(e.navigation.length, 0);
});

test('après un échec API, une URL déjà obtenue permet de créer sans renvoyer la photo', async () => {
  const e = editor({ savedPhoto: 'https://example.supabase.co/already-uploaded.jpg' });
  saveButton(e.tree).props.onPress();
  await flush();
  assert.equal(e.uploads.length, 0);
  assert.equal(e.calls[0][1].method, 'POST');
  assert.equal(JSON.parse(e.calls[0][1].body).image_url, 'https://example.supabase.co/already-uploaded.jpg');
});

test('une recette existante sans photo reste modifiable', async () => {
  const e = editor({ id: 'recipe_old' });
  assert.equal(saveButton(e.tree).props.disabled, false);
  saveButton(e.tree).props.onPress();
  await flush();
  assert.equal(e.calls[0][1].method, 'PUT');
  assert.equal(JSON.parse(e.calls[0][1].body).image_url, null);
});

test('sélection fixe de l’unité et saisie séparée : envoyer la quantité et l’unité choisies', async () => {
  const e = editor({ localPhoto: 'file:///photo.jpg' });
  const options = nodes(e.tree).filter(n => n.props?.accessibilityRole === 'radio');
  assert.equal(options.length, 3);
  assert.equal(options.filter(n => n.props.accessibilityState.checked).length, 1);
  options[1].props.onPress();
  let tree = e.render();
  assert.equal(nodes(tree).filter(n => n.props?.accessibilityRole === 'radio')[1].props.accessibilityState.checked, true);
  nodes(tree).find(n => n.props?.label === 'Quantité').props.onChangeText('12,5');
  tree = e.render();
  saveButton(tree).props.onPress();
  await flush();
  const ingredient = JSON.parse(e.calls[0][1].body).ingredients[0];
  assert.equal(ingredient.quantity, '12.5');
  assert.equal(ingredient.unit, 'ml');
});

test('aucune unité choisie : bloquer avant tout envoi de photo ou de recette', async () => {
  const e = editor({ localPhoto: 'file:///photo.jpg' });
  e.states[10][0].unit = null;
  saveButton(e.render()).props.onPress();
  await flush();
  assert.equal(e.calls.length, 0);
  assert.equal(e.uploads.length, 0);
  assert.match(e.states[17], /Choisis une unité/);
});

const shareSwitch = tree => nodes(tree).find(n => n.type === 'Switch');
const confirmSave = e => e.alerts.at(-1)[2].find(action => action.style !== 'cancel').onPress();

test('création privée par défaut ; activer le partage attend la sauvegarde et sa confirmation', async () => {
  const e = editor({ localPhoto: 'file:///photo.jpg' });
  assert.equal(shareSwitch(e.tree).props.value, false);
  shareSwitch(e.tree).props.onValueChange(true);
  assert.equal(e.calls.length, 0);
  assert.equal(e.uploads.length, 0);
  saveButton(e.render()).props.onPress();
  await flush();
  assert.equal(e.calls.length, 0);
  assert.equal(e.uploads.length, 0);
  assert.equal(e.alerts.at(-1)[2][0].text, 'Annuler');
  assert.equal(e.alerts.at(-1)[2][0].onPress, undefined);
  confirmSave(e);
  await flush();
  assert.equal(e.calls.length, 1);
  assert.equal(e.calls[0][1].method, 'POST');
  assert.equal(JSON.parse(e.calls[0][1].body).visibility, 'public');
  assert.equal(e.navigation.length, 1);
});

test('une création privée transmet explicitement private', async () => {
  const e = editor({ savedPhoto: 'https://example.supabase.co/photo.jpg' });
  saveButton(e.tree).props.onPress();
  await flush();
  assert.equal(JSON.parse(e.calls[0][1].body).visibility, 'private');
  assert.equal(e.alerts.length, 0);
});

test('édition : charger la visibilité publique existante', async () => {
  const e = editor({ id: 'recipe_existing', loadedRecipe: { id: 'recipe_existing', is_owned: true,
    name: 'Soupe', description: 'Soupe', servings: 2, prep_time_minutes: 10, cook_time_minutes: 0,
    image_url: null, visibility: 'public', ingredients: [], instructions: [], tags: [] } });
  e.effects[0]();
  await flush();
  assert.equal(shareSwitch(e.render()).props.value, true);
  assert.equal(e.states[20], 'public');
});

for (const current of ['private', 'public']) {
  test(`édition ${current} : changement confirmé, ordre des requêtes et PUT sans visibilité`, async () => {
    const e = editor({ id: 'recipe_existing', visibility: current });
    shareSwitch(e.tree).props.onValueChange(current === 'private');
    saveButton(e.render()).props.onPress();
    assert.equal(e.calls.length, 0);
    confirmSave(e);
    await flush();
    assert.deepEqual(e.calls.map(call => call[1].method), current === 'private' ? ['PUT', 'PATCH'] : ['PATCH', 'PUT']);
    const put = e.calls.find(call => call[1].method === 'PUT');
    assert.equal(Object.hasOwn(JSON.parse(put[1].body), 'visibility'), false);
    const patch = e.calls.find(call => call[1].method === 'PATCH');
    assert.equal(JSON.parse(patch[1].body).visibility, current === 'private' ? 'public' : 'private');
    assert.equal(e.navigation.length, 1);
  });
}

test('publication échouée après PUT : message de sauvegarde partielle et nouvelle tentative sans création', async () => {
  const e = editor({ id: 'recipe_existing', failures: { PATCH: 1 } });
  shareSwitch(e.tree).props.onValueChange(true);
  saveButton(e.render()).props.onPress(); confirmSave(e);
  await flush();
  assert.equal(e.navigation.length, 0);
  assert.match(e.states[17], /modifications sont enregistrées/);
  saveButton(e.render()).props.onPress(); confirmSave(e);
  await flush();
  assert.deepEqual(e.calls.map(call => call[1].method), ['PUT', 'PATCH', 'PUT', 'PATCH']);
  assert.equal(e.navigation.length, 1);
});

test('retrait échoué : ne pas enregistrer les modifications destinées à une recette privée', async () => {
  const e = editor({ id: 'recipe_existing', visibility: 'public', failures: { PATCH: 1 } });
  shareSwitch(e.tree).props.onValueChange(false);
  saveButton(e.render()).props.onPress(); confirmSave(e);
  await flush();
  assert.deepEqual(e.calls.map(call => call[1].method), ['PATCH']);
  assert.equal(e.navigation.length, 0);
});

test('retrait réussi mais PUT échoué : conserver le statut privé confirmé et permettre de réessayer', async () => {
  const e = editor({ id: 'recipe_existing', visibility: 'public', failures: { PUT: 1 } });
  shareSwitch(e.tree).props.onValueChange(false);
  saveButton(e.render()).props.onPress(); confirmSave(e);
  await flush();
  assert.match(e.states[17], /recette est privée/);
  assert.equal(e.states[20], 'private');
  assert.equal(e.navigation.length, 0);
  saveButton(e.render()).props.onPress();
  await flush();
  assert.deepEqual(e.calls.map(call => call[1].method), ['PATCH', 'PUT', 'PUT']);
  assert.equal(e.navigation.length, 1);
});

test('PUT échoué avant publication : ne pas rendre publique une ancienne version du contenu', async () => {
  const e = editor({ id: 'recipe_existing', failures: { PUT: 1 } });
  shareSwitch(e.tree).props.onValueChange(true);
  saveButton(e.render()).props.onPress(); confirmSave(e);
  await flush();
  assert.deepEqual(e.calls.map(call => call[1].method), ['PUT']);
  assert.equal(e.states[20], 'private');
  assert.equal(e.navigation.length, 0);
});

test('édition publique sans changement de statut : conserver la publication sans PATCH', async () => {
  const e = editor({ id: 'recipe_existing', visibility: 'public' });
  saveButton(e.tree).props.onPress();
  await flush();
  assert.deepEqual(e.calls.map(call => call[1].method), ['PUT']);
  assert.equal(e.alerts.length, 0);
  assert.equal(e.navigation.length, 1);
});
