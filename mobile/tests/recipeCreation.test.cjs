const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function editor({ localPhoto = null, savedPhoto = null, uploadFails = false, name = 'Recette test', id, visibility = 'private', failures = {}, loadedRecipe, startStage = 4, chosenPhoto = null } = {}) {
  const calls = [], uploads = [], navigation = [], alerts = [], effects = [];
  let storedVisibility = visibility;
  const states = { 0: [{ id: 'ing_test', name: 'Ingrédient' }], 1: name,
    5: savedPhoto, 6: localPhoto, 7: [{ ingredient_id: 'ing_test', quantity: '100', unit: 'g', preparation: null }],
    8: [{ text: 'Préparer.', duration: '10' }], 13: false, 16: visibility, 17: visibility };
  states[19] = startStage;
  let cursor = 0, refCursor = 0, prevent, focus;
  const refs = [], backHandlers = [];
  const exports = {};
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const ui = new Proxy({}, { get: (_, name) => name === '__esModule' ? true : String(name) });
  const form = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../services/recipeForm.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: form });
  const requireMock = name => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (name === 'react') return { useCallback: fn => fn, useRef(initial) { const index = refCursor++; return refs[index] ?? (refs[index] = { current: initial }); }, useEffect(fn) { effects.push(fn); }, useState(initial) {
      const index = cursor++;
      if (!Object.hasOwn(states, index)) states[index] = initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    } };
    if (name === '@react-navigation/native') return { usePreventRemove: (enabled, callback) => { prevent = { enabled, callback }; }, useFocusEffect: callback => { focus = callback; } };
    if (name === 'react-native') return { Text: 'Text', View: 'View', Pressable: 'Pressable',
      Modal: 'Modal', Keyboard: { dismiss() {} }, BackHandler: { addEventListener: (_, handler) => { backHandlers.push(handler); return { remove() {} }; } }, Switch: 'Switch', KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'ios' }, Alert: { alert: (...args) => alerts.push(args) } };
    if (name.endsWith('services/recipeForm')) return form;
    if (name.endsWith('services/recipeImages')) return {
      chooseRecipeImage: async () => chosenPhoto,
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
  const render = () => { cursor = 0; refCursor = 0; return exports.default({ route: { params: id ? { id } : undefined },
    navigation: { reset: value => navigation.push(value), dispatch: value => navigation.push(value), goBack: () => navigation.push('back') } }); };
  return { tree: render(), render, calls, uploads, navigation, states, alerts, effects,
    page: stage => { states[19] = stage; return render(); },
    final: () => { states[19] = 4; return render(); },
    prevent: () => prevent,
    focus: () => { focus(); return backHandlers.at(-1); },
  };
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
      assert.match(e.states[14], /Ajoute un nom/);
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
  assert.match(e.states[14], /Ajoute une photo/);
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
  assert.equal(Object.hasOwn(JSON.parse(e.calls[0][1].body), 'difficulty'), false);
  assert.equal(e.navigation.length, 1);
});

test('échec Storage : ne pas créer, conserver la photo pour réessayer', async () => {
  const e = editor({ localPhoto: 'file:///photo.jpg', uploadFails: true });
  saveButton(e.tree).props.onPress();
  await flush();
  assert.equal(e.calls.length, 0);
  assert.equal(e.states[6], 'file:///photo.jpg');
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
  const e = editor({ localPhoto: 'file:///photo.jpg', startStage: 1 });
  const picker = nodes(e.tree).find(n => n.props?.ingredientLabel);
  assert.equal(picker.props.value, 'g');
  picker.props.onChange('ml');
  let tree = e.render();
  assert.equal(nodes(tree).find(n => n.props?.ingredientLabel).props.value, 'ml');
  nodes(tree).find(n => n.props?.label === 'Quantité').props.onChangeText('12,5');
  tree = e.render();
  saveButton(e.final()).props.onPress();
  await flush();
  const ingredient = JSON.parse(e.calls[0][1].body).ingredients[0];
  assert.equal(ingredient.quantity, '12.5');
  assert.equal(ingredient.unit, 'ml');
});

for (const [label, unit] of [['Tasse (250 millilitres)', 'cup'], ['Cuillère à table (15 millilitres)', 'tbsp'], ['Cuillère à thé (5 millilitres)', 'tsp']]) {
  test(`sélectionner ${label} et enregistrer une demi-mesure`, async () => {
    const e = editor({ localPhoto: 'file:///photo.jpg', startStage: 1 });
    nodes(e.tree).find(n => n.props?.ingredientLabel).props.onChange(unit);
    nodes(e.render()).find(n => n.props?.label === 'Quantité').props.onChangeText('0,5');
    saveButton(e.final()).props.onPress();
    await flush();
    const ingredient = JSON.parse(e.calls[0][1].body).ingredients[0];
    assert.equal(ingredient.quantity, '0.5');
    assert.equal(ingredient.unit, unit);
  });
}

test('aucune unité choisie : bloquer avant tout envoi de photo ou de recette', async () => {
  const e = editor({ localPhoto: 'file:///photo.jpg' });
  e.states[7][0].unit = null;
  saveButton(e.render()).props.onPress();
  await flush();
  assert.equal(e.calls.length, 0);
  assert.equal(e.uploads.length, 0);
  assert.match(e.states[14], /Choisis une unité/);
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
  assert.equal(shareSwitch(e.render()), undefined);
  assert.equal(e.states[17], 'public');
});

for (const current of ['private']) {
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
  assert.match(e.states[14], /modifications sont enregistrées/);
  saveButton(e.render()).props.onPress(); confirmSave(e);
  await flush();
  assert.deepEqual(e.calls.map(call => call[1].method), ['PUT', 'PATCH', 'PUT', 'PATCH']);
  assert.equal(e.navigation.length, 1);
});

test('édition publique : aucun interrupteur permettant de retirer la publication', () => {
  const e = editor({ id: 'recipe_existing', visibility: 'public' });
  assert.equal(shareSwitch(e.tree), undefined);
});

test('PUT échoué avant publication : ne pas rendre publique une ancienne version du contenu', async () => {
  const e = editor({ id: 'recipe_existing', failures: { PUT: 1 } });
  shareSwitch(e.tree).props.onValueChange(true);
  saveButton(e.render()).props.onPress(); confirmSave(e);
  await flush();
  assert.deepEqual(e.calls.map(call => call[1].method), ['PUT']);
  assert.equal(e.states[17], 'private');
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

test('temps par étape : calculer le total, conserver les durées après déplacement et retrait', async () => {
  const e = editor({ localPhoto: 'file:///photo.jpg', startStage: 2 });
  assert.equal(nodes(e.tree).some(n => /^(Préparation|Cuisson) \(minutes\)$/.test(n.props?.label)), false);
  nodes(e.tree).find(n => n.props?.title === '+ Ajouter une étape').props.onPress();
  let tree = e.render();
  nodes(tree).find(n => n.props?.label === 'Étape 2').props.onChangeText('Cuire.');
  tree = e.render();
  nodes(tree).find(n => n.props?.accessibilityLabel === 'Durée de l’étape 2 en minutes, obligatoire').props.onChangeText('25');
  tree = e.render();
  assert.ok(nodes(tree).some(n => Array.isArray(n.props?.children) && n.props.children.join('') === 'Durée totale : 35 min'));
  nodes(tree).find(n => n.props?.accessibilityLabel === 'Monter l’étape 2').props.onPress();
  tree = e.render();
  saveButton(e.final()).props.onPress();
  await flush();
  const body = JSON.parse(e.calls[0][1].body);
  assert.equal(body.total_time_minutes, 35);
  assert.deepEqual(body.instructions, [
    { position: 1, text: 'Cuire.', duration_minutes: 25 },
    { position: 2, text: 'Préparer.', duration_minutes: 10 },
  ]);
  nodes(tree).find(n => n.props?.accessibilityLabel === 'Retirer l’étape 1').props.onPress();
  assert.ok(nodes(e.page(2)).some(n => Array.isArray(n.props?.children) && n.props.children.join('') === 'Durée totale : 10 min'));
});

for (const duration of ['', '-1', '1,5', 'abc']) {
  test(`durée invalide ${JSON.stringify(duration)} : bloquer avant tout envoi`, async () => {
    const e = editor({ localPhoto: 'file:///photo.jpg', startStage: 2 });
    nodes(e.tree).find(n => n.props?.label === 'Durée (min)').props.onChangeText(duration);
    saveButton(e.final()).props.onPress();
    await flush();
    assert.equal(e.calls.length, 0);
    assert.equal(e.uploads.length, 0);
    assert.match(e.states[14], /durée de l’étape 1/);
  });
}

test('édition : charger les durées enregistrées sans les perdre', async () => {
  const e = editor({ id: 'recipe_existing', loadedRecipe: { is_owned: true,
    name: 'Soupe', description: 'Soupe', servings: 2, image_url: null, visibility: 'private',
    ingredients: [], instructions: [{ position: 1, text: 'Cuire.', duration_minutes: 20 }], tags: [] } });
  e.effects[0]();
  await flush();
  assert.equal(nodes(e.render()).find(n => n.props?.label === 'Durée (min)').props.value, '20');
});

test('ancienne recette : demander les durées sans répartir le total existant', async () => {
  const e = editor({ id: 'recipe_existing', loadedRecipe: { is_owned: true,
    name: 'Soupe', description: 'Soupe', servings: 2, total_time_minutes: 30, image_url: null,
    visibility: 'private', ingredients: [{ ingredient_id: 'ing_test', quantity: '100', unit: 'g', preparation: null }],
    instructions: [{ position: 1, text: 'Cuire.' }], tags: [] } });
  e.effects[0]();
  await flush();
  const tree = e.render();
  assert.equal(nodes(tree).find(n => n.props?.label === 'Durée (min)').props.value, '');
  saveButton(tree).props.onPress();
  await flush();
  assert.equal(e.calls.filter(call => call[1]?.method === 'PUT').length, 0);
});

const button = (tree, title) => nodes(tree).find(node => node.props?.title === title);
const field = (tree, label) => nodes(tree).find(node => node.props?.label === label);
const progress = tree => nodes(tree).find(node => node.props?.accessibilityRole === 'progressbar');
const text = tree => nodes(tree).flatMap(node => Array.isArray(node.props?.children) ? node.props.children : [node.props?.children])
  .filter(value => typeof value === 'string').join(' ');
const next = e => { button(e.render(), 'Continuer').props.onPress(); return e.render(); };

test('création guidée : cinq pages, validations locales, saisies conservées et un seul envoi final', async () => {
  const e = editor({ startStage: 0, name: '', chosenPhoto: 'file:///nouveau.jpg' });
  e.states[7] = [{ ingredient_id: '', quantity: '', unit: null, preparation: null }];
  e.states[8] = [{ text: '', duration: '' }];
  let tree = e.render();
  assert.equal(progress(tree).props.accessibilityValue.now, 1);
  assert.match(text(tree), /Nom et photo obligatoires/);
  assert.equal(button(tree, 'Continuer').props.disabled, true);
  assert.equal(saveButton(tree), undefined);
  assert.equal(field(tree, 'Quantité'), undefined);
  field(tree, 'Nom de la recette (obligatoire)').props.onChangeText('Soupe maison');
  tree = e.render();
  nodes(tree).find(node => node.type === 'Pressable' && text(node).includes('+ Ajouter une photo')).props.onPress();
  await flush();
  tree = e.render();
  assert.equal(button(tree, 'Continuer').props.disabled, false);
  field(tree, 'Portions').props.onChangeText('0');
  tree = next(e);
  assert.equal(progress(tree).props.accessibilityValue.now, 1);
  assert.match(e.states[14], /portions/);
  field(tree, 'Portions').props.onChangeText('3');
  tree = next(e);
  assert.equal(progress(tree).props.accessibilityValue.now, 2);
  assert.equal(field(tree, 'Nom de la recette (obligatoire)'), undefined);
  next(e);
  assert.match(e.states[14], /ingrédient/);
  tree = e.render();
  nodes(tree).find(node => node.props?.accessibilityLabel === 'Choisir l’ingrédient 1').props.onPress();
  nodes(e.render()).find(node => node.props?.onSelect).props.onSelect('ing_test');
  field(e.render(), 'Quantité').props.onChangeText('0,5');
  next(e);
  assert.match(e.states[14], /unité/);
  nodes(e.render()).find(node => node.props?.ingredientLabel).props.onChange('cup');
  tree = next(e);
  assert.equal(progress(tree).props.accessibilityValue.now, 3);
  assert.equal(field(tree, 'Quantité'), undefined);
  next(e);
  assert.match(e.states[14], /Décris l’étape/);
  field(e.render(), 'Étape 1').props.onChangeText('Mélanger.');
  field(e.render(), 'Durée (min)').props.onChangeText('1,5');
  next(e);
  assert.match(e.states[14], /durée/);
  field(e.render(), 'Durée (min)').props.onChangeText('0');
  tree = next(e);
  assert.equal(progress(tree).props.accessibilityValue.now, 4);
  assert.equal(field(tree, 'Étape 1'), undefined);
  field(tree, 'Étiquettes (facultatif)').props.onChangeText(Array(11).fill('test').join(','));
  next(e);
  assert.equal(progress(e.render()).props.accessibilityValue.now, 4);
  assert.match(e.states[14], /10 étiquettes/);
  field(e.render(), 'Étiquettes (facultatif)').props.onChangeText('Maison, Végétarien');
  button(e.render(), 'Autres informations (facultatif)').props.onPress();
  field(e.render(), 'Description (facultatif)').props.onChangeText('Une soupe pour trois.');
  tree = next(e);
  assert.equal(progress(tree).props.accessibilityValue.now, 5);
  assert.equal(shareSwitch(tree).props.value, false);
  assert.ok(saveButton(tree));
  assert.equal(button(tree, 'Continuer'), undefined);
  assert.equal(e.calls.length, 0);
  assert.equal(e.uploads.length, 0);
  button(tree, 'Précédent').props.onPress();
  assert.equal(field(e.render(), 'Description (facultatif)').props.value, 'Une soupe pour trois.');
  button(e.render(), 'Précédent').props.onPress();
  assert.equal(field(e.render(), 'Étape 1').props.value, 'Mélanger.');
  assert.equal(field(e.render(), 'Durée (min)').props.value, '0');
  next(e); next(e);
  saveButton(e.render()).props.onPress();
  await flush();
  assert.deepEqual(e.uploads, ['file:///nouveau.jpg']);
  assert.equal(e.calls.length, 1);
  const payload = JSON.parse(e.calls[0][1].body);
  assert.equal(payload.name, 'Soupe maison');
  assert.equal(payload.servings, 3);
  assert.equal(payload.description, 'Une soupe pour trois.');
  assert.equal(payload.ingredients[0].quantity, '0.5');
  assert.equal(payload.ingredients[0].unit, 'cup');
  assert.equal(payload.total_time_minutes, 0);
  assert.equal(payload.visibility, 'private');
  assert.deepEqual(payload.tags, ['Maison', 'Végétarien']);
});

test('Précédent, retour de titre et retour Android reculent sans perdre les saisies', () => {
  const e = editor({ startStage: 0, localPhoto: 'file:///photo.jpg' });
  next(e); next(e);
  const back = nodes(e.render()).find(node => node.props?.onBack);
  back.props.onBack();
  assert.equal(progress(e.render()).props.accessibilityValue.now, 2);
  const onAndroidBack = e.focus();
  assert.equal(onAndroidBack(), true);
  const tree = e.render();
  assert.equal(progress(tree).props.accessibilityValue.now, 1);
  assert.equal(field(tree, 'Nom de la recette (obligatoire)').props.value, 'Recette test');
  assert.equal(e.states[6], 'file:///photo.jpg');
  assert.equal(e.focus()(), false);
  assert.equal(e.navigation.length, 0);
});

test('quitter une création : confirmation annulable et abandon sans sauvegarde', () => {
  const e = editor({ startStage: 0, localPhoto: 'file:///photo.jpg' });
  const action = { type: 'GO_BACK' };
  assert.equal(e.prevent().enabled, true);
  e.prevent().callback({ data: { action } });
  assert.match(text(e.render()), /Quitter la création/);
  button(e.render(), 'Continuer ma recette').props.onPress();
  assert.equal(nodes(e.render()).some(node => node.type === 'Modal'), false);
  assert.equal(e.states[1], 'Recette test');
  assert.equal(e.navigation.length, 0);
  e.prevent().callback({ data: { action } });
  button(e.render(), 'Abandonner la recette').props.onPress();
  assert.equal(e.navigation[0], action);
  assert.equal(e.calls.length, 0);
  assert.equal(e.uploads.length, 0);
});

test('création vide : aucun avertissement de perte de saisie à la sortie', () => {
  const e = editor({ startStage: 0, name: '' });
  e.states[7] = [{ ingredient_id: '', quantity: '', unit: null, preparation: null }];
  e.states[8] = [{ text: '', duration: '' }];
  e.render();
  assert.equal(e.prevent().enabled, false);
});

test('échec API final : conserver les cinq pages et réutiliser la photo déjà envoyée', async () => {
  const e = editor({ startStage: 0, localPhoto: 'file:///photo.jpg', failures: { POST: 1 } });
  for (let stage = 0; stage < 4; stage++) next(e);
  saveButton(e.render()).props.onPress();
  await flush();
  assert.equal(progress(e.render()).props.accessibilityValue.now, 5);
  assert.equal(e.navigation.length, 0);
  assert.equal(e.states[1], 'Recette test');
  assert.equal(e.uploads.length, 1);
  saveButton(e.render()).props.onPress();
  await flush();
  assert.equal(e.uploads.length, 1);
  assert.equal(e.calls.length, 2);
  assert.equal(e.navigation.length, 1);
  const action = { type: 'RESET' };
  e.prevent().callback({ data: { action } });
  assert.equal(e.navigation.at(-1), action);
  assert.equal(nodes(e.render()).some(node => node.type === 'Modal'), false);
});

test('double appui sur Enregistrer : une seule photo et une seule création', async () => {
  const e = editor({ localPhoto: 'file:///photo.jpg' });
  const save = saveButton(e.tree);
  save.props.onPress(); save.props.onPress();
  await flush();
  assert.equal(e.uploads.length, 1);
  assert.equal(e.calls.length, 1);
});
