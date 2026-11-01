const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function editor({ localPhoto = null, savedPhoto = null, uploadFails = false, id } = {}) {
  const calls = [], uploads = [], navigation = [];
  const states = { 0: [{ id: 'ing_test', name: 'Ingrédient' }], 1: 'Recette test',
    8: savedPhoto, 9: localPhoto, 10: [{ ingredient_id: 'ing_test', amount: '100 g', preparation: null }],
    11: ['Préparer.'], 16: false };
  let cursor = 0;
  const exports = {};
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const ui = new Proxy({}, { get: (_, name) => name === '__esModule' ? true : String(name) });
  const form = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../services/recipeForm.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: form });
  const requireMock = name => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (name === 'react') return { useEffect() {}, useState(initial) {
      const index = cursor++;
      if (!Object.hasOwn(states, index)) states[index] = initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    } };
    if (name === 'react-native') return { Text: 'Text', View: 'View', Pressable: 'Pressable',
      KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'ios' }, Alert: { alert() {} } };
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
      calls.push(args); return { item: { id: 'recipe_created' } };
    } };
    return ui;
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../app/RecipeEditorScreen.tsx'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, require: requireMock });
  const tree = exports.default({ route: { params: id ? { id } : undefined },
    navigation: { reset: value => navigation.push(value) } });
  return { tree, calls, uploads, navigation, states };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const saveButton = tree => nodes(tree).find(n => n.props?.title === 'Enregistrer la recette');
const flush = () => new Promise(setImmediate);

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
