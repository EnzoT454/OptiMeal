const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const flush = () => new Promise(setImmediate);
const json = value => JSON.parse(JSON.stringify(value));
const fixture = () => ({ id: 'list', name: 'Courses', source: 'manual', status: 'completed', revision: 8, period: null,
  purchase_date: '2026-11-14', choices: [{ item_id: 'rice', product_id: 'maxi:1:rice' }], warnings: [], purchases: [], product_purchases: [],
  created_at: '2026-11-14T12:00:00Z', updated_at: '2026-11-16T12:00:00Z', assignment: null,
  totals: { item_count: 1, remaining_item_count: 0, purchased_item_count: 1, owned_item_count: 0, unpriced_item_count: 1, budget_known_amount: '0', remaining_known_amount: '0', estimate_complete: false },
  items: [{ id: 'rice', ingredient_id: 'ing_riz', name: 'Riz', category: 'Épicerie', need_revision: 1, required: [{ amount: '500', unit: 'g' }],
    owned: [], contributions: [], coverage_status: 'purchased', removed: false }] });
const templateFixture = () => ({ id: 'template', name: 'Hebdomadaire', icon: 'basket', revision: 2, deleted: false,
  items: [{ id: 'item', name: 'Riz', ingredient_id: 'ing_riz', category: 'Épicerie', required: [{ amount: '500', unit: 'g' }], preferred_product_id: null }] });

function screen(file, options = {}) {
  let cursor = 0, props = options.props ?? {}, sequence = 0;
  const hooks = [], effects = [], commands = [], navigations = [], alerts = [], reads = [];
  const auth = { session: { user: { id: 'alice' } }, requestSignIn() {} };
  const source = options.source ?? fixture(), template = options.template ?? templateFixture();
  const headerOptions = {};
  const pages = options.pages ?? { items: [], total: 0 };
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
  function memo(fn, deps) {
    const i = cursor++;
    if (!hooks[i] || deps.some((v, n) => v !== hooks[i].deps[n])) hooks[i] = { deps, fn };
    return hooks[i].fn;
  }
  const exports = {};
  const methods = {
    useListCommand(scope) { return { ready: true, busy: false, locked: !!options.pending, pending: options.pending ?? null, error: '',
      run: async command => { commands.push(command); return options.result ? options.result(command) : null; } }; },
  };
  const requireMock = name => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (name === 'react') return { useState(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [hooks[i].value, value => { hooks[i].value = typeof value === 'function' ? value(hooks[i].value) : value; }]; },
      useRef(current) { const i = cursor++; return hooks[i] ??= { current }; }, useCallback: memo, useEffect(fn, deps) { const i = cursor++; if (!hooks[i] || deps.some((v, n) => v !== hooks[i].deps[n])) {
        const previous = hooks[i]; hooks[i] = { deps }; effects.push(() => { previous?.cleanup?.(); hooks[i].cleanup = fn(); });
      } } };
    if (name === '@react-navigation/native') return { useFocusEffect(fn) { const i = cursor++; if (!hooks[i] || hooks[i].fn !== fn) {
      effects.push(() => { hooks[i]?.cleanup?.(); hooks[i] = { fn, cleanup: fn() }; });
    } } };
    if (name === 'react-native') return { Text: 'Text', View: 'View', ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', Modal: 'Modal', Alert: { alert: (...args) => alerts.push(args) } };
    if (name === 'expo-crypto') return { randomUUID: () => `uuid-${++sequence}` };
    if (name.includes('AuthContext')) return { useAuth: () => auth };
    if (name.endsWith('useListCommand')) return methods;
    if (name.endsWith('useShoppingPage')) return { useShoppingPage: () => ({ ...pages, loading: false, error: '', load: async () => {} }) };
    if (name.endsWith('shoppingLists')) return { listsPath: '/api/v1/shopping-lists', localDate: () => '2026-11-20',
      quantityLabel: values => values.map(v => `${v.amount} ${v.unit}`).join(' + '), dateLabel: v => v,
      recalculatePricesCommand: list => ({ key: 'recalculate', path: `/api/v1/shopping-lists/${list.id}/recalculate-prices`, method: 'POST', body: { expected_revision: list.revision } }),
      listCommand: (path, body, method = 'POST') => ({ key: 'stable-key', path, body, method }),
      fetchList: async (...args) => { reads.push('current'); return options.fetchList ? options.fetchList(...args) : source; },
      fetchLists: async (offset, collection) => { reads.push({ offset, collection }); return pages; },
    };
    if (name.endsWith('shoppingReuse')) return { templatesPath: '/api/v1/shopping-list-templates', exclusionsPath: '/api/v1/shopping-list-exclusions',
      templateIcons: { basket: '🧺', cart: '🛒', leaf: '🌿', restaurant: '🍽', home: '🏠' }, timestampLabel: v => v,
      fetchTemplate: async () => { if (options.templateUnavailable) throw new Error('Modèle introuvable.'); return template; },
    };
    if (name.endsWith('courseQuantities')) return { positiveAmount: value => { const normalized = value.replace(',', '.'); return /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(normalized) && /[1-9]/.test(normalized) ? normalized : null; } };
    if (name.endsWith('/api')) return { api: async () => ({ items: [] }) };
    if (name.endsWith('/recipes')) return { RecipeButton: 'Button', RecipeField: 'Field', RecipeScreen: 'Screen', RecipeTitle: 'Title', recipeStyles: {}, recipeColors: {} };
    if (name.endsWith('/ui')) return { Message: 'Message' };
    return { __esModule: true, default: name, ListDateField: 'ListDateField' };
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: requireMock, Date, Object, Error });
  const navigation = { navigate: (...args) => navigations.push(args), replace: (...args) => navigations.push(args), push: (...args) => navigations.push(args), setOptions: value => Object.assign(headerOptions, value), goBack: () => navigations.push(['back']) };
  function render(next = props) { props = next; cursor = 0; const tree = exports.default({ navigation, ...props }); while (effects.length) effects.shift()(); return tree; }
  return { render, async ready() { render(); await flush(); return render(); }, commands, navigations, alerts, reads, template, auth, header: () => headerOptions.headerRight() };
}
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
const button = (h, title) => nodes(h.render()).find(n => n.props.title === title);
const field = (h, label) => nodes(h.render()).find(n => n.props.label === label);
const checkbox = h => nodes(h.render()).find(n => n.props.accessibilityRole === 'checkbox');

test('copier une révision envoie uniquement identité, besoins demandés et nouvelle date, sans achats ni prix', async () => {
  const h = screen('app/ShoppingReuseScreen.tsx', { props: { route: { params: { id: 'list', revision: 8, mode: 'copy' } } }, result: () => ({ id: 'copy', status: 'draft' }) });
  await h.ready();
  field(h, 'Nom de la nouvelle liste').props.onChangeText('Autre semaine');
  await button(h, 'Créer la copie').props.onPress(); await flush();
  assert.deepEqual(json(h.commands[0].body), { source_revision: 8, name: 'Autre semaine', purchase_date: '2026-11-20', include_choices: false });
  assert.equal(h.commands[0].path, '/api/v1/shopping-lists/list/duplicate');
  assert.deepEqual(json(h.navigations[0]), ['ShoppingDetail', { id: 'copy' }]);
});

test('les choix de produits ne sont repris qu’après sélection explicite', async () => {
  const h = screen('app/ShoppingReuseScreen.tsx', { props: { route: { params: { id: 'list', revision: 8, mode: 'template' } } } });
  await h.ready(); checkbox(h).props.onPress();
  await button(h, 'Enregistrer le modèle').props.onPress();
  assert.equal(h.commands[0].body.include_choices, true);
  assert.equal(h.commands[0].body.source_list_id, 'list');
  assert.equal(h.commands[0].body.icon, 'basket');
  assert.equal(h.commands[0].body.purchases, undefined);
});

test('une réponse perdue conserve les champs et la même commande de copie est reprise', async () => {
  const pending = { key: 'saved', method: 'POST', path: '/copy', body: { source_revision: 7 } };
  const h = screen('app/ShoppingReuseScreen.tsx', { props: { route: { params: { id: 'list', revision: 8, mode: 'copy' } } }, pending });
  await h.ready(); await button(h, 'Reprendre l’enregistrement').props.onPress();
  assert.equal(h.commands[0], pending);
});

const openMenu = h => { h.render(); h.header().props.onPress(); h.render(); };
const modelScreen = options => screen('app/ShoppingTemplateDetailScreen.tsx', { ...options, props: { route: { params: { id: 'template' } } } });

test('le modèle affiche ses produits et propose les trois actions dans le menu d’en-tête', async () => {
  const h = modelScreen(); await h.ready();
  assert.equal(h.header().props.accessibilityLabel, 'Options du modèle');
  assert.equal(button(h, 'Supprimer le modèle'), undefined);
  assert.equal(button(h, 'Modifier le modèle'), undefined);
  assert.equal(button(h, 'Créer une liste depuis ce modèle'), undefined);
  assert.equal(field(h, 'Nom de la nouvelle liste'), undefined);
  assert.equal(nodes(h.render()).some(n => n.type === 'ListDateField'), false);
  assert.ok(nodes(h.render()).some(n => n.props.accessibilityLabel === 'Modifier Riz'));
  openMenu(h);
  for (const title of ['Modifier le nom', 'Supprimer le modèle', 'Ajouter un produit']) assert.ok(button(h, title));
  button(h, 'Fermer').props.onPress();
  assert.equal(button(h, 'Supprimer le modèle'), undefined);
});

test('renommer un modèle ne renvoie ni ses produits ni son icône', async () => {
  const h = modelScreen(); await h.ready(); openMenu(h);
  button(h, 'Modifier le nom').props.onPress();
  field(h, 'Nom du modèle').props.onChangeText('Barbecue');
  await button(h, 'Enregistrer le nom').props.onPress(); await flush();
  assert.equal(h.commands[0].method, 'PATCH');
  assert.deepEqual(json(h.commands[0].body), { expected_revision: 2, name: 'Barbecue' });
  assert.equal(h.template.name, 'Hebdomadaire');
});

test('ajouter un produit enregistre directement les besoins dans le modèle sans créer de liste', async () => {
  const h = modelScreen(); await h.ready(); openMenu(h);
  button(h, 'Ajouter un produit').props.onPress();
  field(h, 'Produit').props.onChangeText('Serviettes');
  await button(h, 'Ajouter au modèle').props.onPress(); await flush();
  assert.equal(h.commands.length, 1);
  assert.equal(h.commands[0].method, 'PATCH');
  assert.equal(h.commands[0].path, '/api/v1/shopping-list-templates/template');
  assert.equal(h.commands[0].body.expected_revision, 2);
  assert.equal(h.commands[0].body.items.length, 2);
  assert.deepEqual(json(h.commands[0].body.items[1]), { id: 'uuid-1', name: 'Serviettes', ingredient_id: null, category: 'Autres', required: [], preferred_product_id: null });
  assert.deepEqual(json(h.commands[0].body.items[0]), h.template.items[0]);
  assert.equal(h.template.items.length, 1);
  assert.equal(h.navigations.length, 0);
});

test('annuler un ajout ne modifie pas le modèle et une quantité invalide bloque l’enregistrement', async () => {
  const h = modelScreen(); await h.ready(); openMenu(h);
  button(h, 'Ajouter un produit').props.onPress();
  field(h, 'Produit').props.onChangeText('Riz');
  field(h, 'Quantité (facultative)').props.onChangeText('-5');
  await button(h, 'Ajouter au modèle').props.onPress();
  assert.equal(h.commands.length, 0);
  assert.ok(nodes(h.render()).some(n => n.props.accessibilityRole === 'alert'));
  button(h, 'Annuler').props.onPress();
  assert.equal(field(h, 'Produit'), undefined);
  assert.equal(h.template.items.length, 1);
});

test('modifier un produit conserve les autres dimensions et la préférence de produit', async () => {
  const template = templateFixture();
  template.items[0].required.push({ amount: '2', unit: 'unit' });
  template.items[0].preferred_product_id = 'maxi:1:rice';
  const h = modelScreen({ template }); await h.ready();
  nodes(h.render()).find(n => n.props.accessibilityLabel === 'Modifier Riz').props.onPress();
  field(h, 'Quantité (facultative)').props.onChangeText('750');
  nodes(h.render()).find(n => n.props.allowedUnits).props.onChange('g');
  await button(h, 'Enregistrer le produit').props.onPress(); await flush();
  assert.deepEqual(json(h.commands[0].body.items[0].required), [{ amount: '2', unit: 'unit' }, { amount: '750', unit: 'g' }]);
  assert.equal(h.commands[0].body.items[0].preferred_product_id, 'maxi:1:rice');
  assert.equal(template.items[0].required[0].amount, '500');
});

test('retirer les quantités est explicite et ne retire pas le produit', async () => {
  const h = modelScreen(); await h.ready();
  nodes(h.render()).find(n => n.props.accessibilityLabel === 'Modifier Riz').props.onPress();
  button(h, 'Retirer les quantités').props.onPress();
  await button(h, 'Enregistrer le produit').props.onPress(); await flush();
  assert.equal(h.commands[0].body.items[0].required.length, 0);
  assert.equal(h.commands[0].body.items[0].id, 'item');
  assert.equal(h.template.items[0].required[0].amount, '500');
});

test('supprimer un modèle demande confirmation et transmet une révision sans supprimer une liste', async () => {
  const h = modelScreen(); await h.ready(); openMenu(h);
  button(h, 'Supprimer le modèle').props.onPress();
  assert.equal(h.commands.length, 0);
  assert.equal(h.alerts[0][2][0].text, 'Annuler');
  await h.alerts[0][2][1].onPress(); await flush();
  assert.equal(h.commands[0].method, 'DELETE');
  assert.deepEqual(json(h.commands[0].body), { expected_revision: 2 });
});

test('Ne plus suggérer confirme sa portée future et ne modifie pas la liste courante', async () => {
  const h = screen('components/lists/ListExclusionAction.tsx', { props: { ingredientId: 'ing_riz', name: 'Riz', disabled: false } });
  button(h, 'Ne plus suggérer').props.onPress();
  assert.equal(h.commands.length, 0);
  assert.match(h.alerts[0][1], /Cette liste et tes modèles restent inchangés/);
  await h.alerts[0][2][1].onPress();
  assert.equal(h.commands[0].path, '/api/v1/shopping-list-exclusions/ing_riz');
  assert.deepEqual(json(h.commands[0].body), { excluded: true });
});

test('Paramètres peut annuler une exclusion sans modifier les listes existantes', async () => {
  const h = screen('app/ShoppingExclusionsScreen.tsx', { pages: { items: [{ ingredient_id: 'ing_riz', name: 'Riz' }], total: 1 } });
  await button(h, 'Suggérer à nouveau Riz').props.onPress();
  assert.deepEqual(json(h.commands[0].body), { excluded: false });
});

test('une liste terminée charge son état courant et masque les mutations de liste', async () => {
  const historical = fixture();
  const h = screen('app/ShoppingListDetailScreen.tsx', { source: historical, props: { route: { params: { id: 'list', revision: 8 } } } });
  await h.ready();
  assert.equal(h.reads[0], 'current');
  assert.equal(button(h, 'Actualiser la liste'), undefined);
  assert.equal(button(h, 'Consulter les révisions'), undefined);
  assert.equal(button(h, 'Terminer les courses'), undefined);
  assert.equal(button(h, 'Ajouter un article'), undefined);
  openMenu(h);
  assert.equal(button(h, 'Archiver la liste'), undefined);
  assert.equal(button(h, 'Renommer la liste').props.disabled, true);
  assert.equal(button(h, 'Modifier').props.disabled, true);
  assert.ok(button(h, 'Rouvrir la liste'));
  button(h, 'Utiliser comme modèle').props.onPress();
  assert.deepEqual(json(h.navigations[0]), ['ReuseList', { id: 'list', revision: 8, mode: 'template' }]);
});

test('une suppression avec réponse perdue est reprise même si le modèle est maintenant introuvable', async () => {
  const pending = { key: 'delete-key', method: 'DELETE', path: '/api/v1/shopping-list-templates/template', body: { expected_revision: 2 } };
  const h = screen('app/ShoppingTemplateDetailScreen.tsx', { props: { route: { params: { id: 'template' } } },
    templateUnavailable: true, pending, result: () => ({ id: 'template', revision: 3, deleted: true }) });
  await h.ready();
  await button(h, 'Reprendre l’enregistrement').props.onPress(); await flush();
  assert.equal(h.commands[0], pending);
  assert.deepEqual(json(h.navigations[0]), ['back']);
});

test('la pagination privée ignore une réponse tardive du compte précédent', async () => {
  let cursor = 0;
  const hooks = [], effects = [], requests = [];
  const auth = { session: { user: { id: 'alice' } } };
  const exports = {};
  const react = {
    useRef(value) { const i = cursor++; return hooks[i] ??= { current: value }; },
    useState(initial) { const i = cursor++; hooks[i] ??= { value: initial }; return [hooks[i].value, value => { hooks[i].value = typeof value === 'function' ? value(hooks[i].value) : value; }]; },
    useCallback(fn, deps) { const i = cursor++; if (!hooks[i] || deps.some((v, n) => v !== hooks[i].deps[n])) hooks[i] = { fn, deps }; return hooks[i].fn; },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../components/lists/useShoppingPage.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, require(name) {
    if (name === 'react') return react;
    if (name.endsWith('AuthContext')) return { useAuth: () => auth };
    if (name === '@react-navigation/native') return { useFocusEffect(fn) { const i = cursor++;
      if (!hooks[i] || hooks[i].fn !== fn) effects.push(() => { hooks[i]?.cleanup?.(); hooks[i] = { fn, cleanup: fn() }; });
    } };
    throw new Error(name);
  }, Error });
  const fetchPage = () => new Promise(resolve => requests.push({ user: auth.session.user.id, resolve }));
  function render() {
    cursor = 0; const result = exports.useShoppingPage('templates', fetchPage, item => item.id);
    while (effects.length) effects.shift()(); return result;
  }
  render();
  auth.session = { user: { id: 'bob' } }; render();
  requests[0].resolve({ items: [{ id: 'alice-template' }], total: 1 }); await flush();
  assert.equal(render().items.length, 0);
  requests[1].resolve({ items: [{ id: 'bob-template' }], total: 1 }); await flush();
  assert.deepEqual(json(render().items), [{ id: 'bob-template' }]);
});


test('les achats sont envoyés directement sans file locale et seules les réponses serveur modifient la liste', async () => {
  const source = { ...fixture(), status: 'active' };
  const h = screen('app/ShoppingListDetailScreen.tsx', { source, props: { route: { params: { id: 'list' } } } });
  await h.ready();
  const intent = { key: 'purchase', method: 'PUT', path: '/api/v1/shopping-lists/list/items/rice/manual-purchase', body: { expected_revision: 8, purchased: false, coverage: {} } };
  const courses = () => nodes(h.render()).find(n => n.type === '../components/lists/ListCourses');
  assert.equal(courses().props.pendingCommands, undefined);
  assert.equal(await courses().props.onCommand(intent), false);
  assert.equal(h.commands[0], intent);
  assert.equal(courses().props.list.items[0].coverage_status, 'purchased');
  for (let i = 0; i < 5; i++) h.render();
  assert.equal(h.reads.length, 1);
});

const listScreen = options => screen('app/ShoppingListDetailScreen.tsx', { source: { ...fixture(), status: 'active' }, ...options, props: { route: { params: { id: 'list' } } } });
test('détail : les actions de liste sont dans le menu … de l’en-tête', async () => {
  const h = listScreen(); await h.ready();
  assert.equal(h.header().props.accessibilityLabel, 'Options de la liste');
  assert.equal(button(h, 'Options de la liste'), undefined);
  assert.equal(button(h, 'Terminer les courses'), undefined);
  assert.equal(button(h, 'Renommer la liste'), undefined);
  openMenu(h);
  for (const title of ['Renommer la liste', 'Utiliser comme modèle', 'Marquer comme terminée', 'Modifier']) assert.ok(button(h, title));
  const pin = nodes(h.render()).find(n => n.type === '../components/lists/PinListAction');
  assert.equal(pin.props.id, 'list'); assert.equal(pin.props.disabled, false);
});
test('le menu permet un renommage limité au nom et à la révision courante', async () => {
  const h = listScreen(); await h.ready(); openMenu(h);
  button(h, 'Renommer la liste').props.onPress();
  assert.equal(button(h, 'Modifier'), undefined);
  field(h, 'Nouveau nom').props.onChangeText('Barbecue');
  await button(h, 'Enregistrer le nom').props.onPress(); await flush();
  assert.equal(h.commands[0].path, '/api/v1/shopping-lists/list');
  assert.equal(h.commands[0].method, 'PATCH');
  assert.deepEqual(json(h.commands[0].body), { expected_revision: 8, name: 'Barbecue' });
});
test('marquer comme terminée exige confirmation si des articles restent à acheter', async () => {
  const source = { ...fixture(), status: 'active', totals: { ...fixture().totals, remaining_item_count: 1 } };
  const h = listScreen({ source }); await h.ready(); openMenu(h);
  button(h, 'Marquer comme terminée').props.onPress();
  assert.equal(h.commands.length, 0); assert.equal(h.alerts[0][2][0].text, 'Continuer les courses');
  h.alerts[0][2][1].onPress(); await flush();
  assert.equal(h.commands[0].path, '/api/v1/shopping-lists/list/complete');
  assert.deepEqual(json(h.commands[0].body), { expected_revision: 8, accept_remaining: true });
});
test('modifier ouvre l’éditeur d’articles et met à jour son contenu après réponse serveur', async () => {
  const result = { ...fixture(), status: 'active', revision: 9, items: [...fixture().items, { id: 'bread', name: 'Pain', required: [], removed: false }] };
  const h = listScreen({ result: () => result }); await h.ready(); openMenu(h);
  button(h, 'Modifier').props.onPress();
  const editor = () => nodes(h.render()).find(n => n.type === '../components/lists/ListItemsEditor');
  assert.ok(editor());
  assert.equal(nodes(h.render()).some(n => n.type === '../components/lists/ListCourses'), false);
  await editor().props.onCommand({ key: 'add', path: '/api/v1/shopping-lists/list/items', method: 'POST', body: { expected_revision: 8, name: 'Pain' } });
  assert.equal(editor().props.list.items.length, 2);
  editor().props.onDone();
  assert.equal(editor(), undefined);
  assert.ok(nodes(h.render()).some(n => n.type === '../components/lists/ListCourses'));
});
test('une liste terminée peut être rouverte depuis le même menu', async () => {
  const h = listScreen({ source: fixture() }); await h.ready(); openMenu(h);
  await button(h, 'Rouvrir la liste').props.onPress(); await flush();
  assert.equal(h.commands[0].path, '/api/v1/shopping-lists/list/reopen');
  assert.equal(h.commands[0].body.expected_revision, 8);
});
test('une réponse de modification tardive n’est pas adoptée après un changement de compte', async () => {
  let finish;
  const h = listScreen({ fetchList: (id, user) => ({ ...fixture(), status: 'active', name: user }), result: () => new Promise(resolve => { finish = resolve; }) });
  await h.ready(); openMenu(h); button(h, 'Modifier').props.onPress();
  const editor = nodes(h.render()).find(n => n.type === '../components/lists/ListItemsEditor');
  const pending = editor.props.onCommand({ key: 'add', path: '/items', method: 'POST', body: {} });
  h.auth.session = { user: { id: 'bob' } }; await h.ready();
  finish({ ...fixture(), revision: 9, name: 'alice-private' });
  assert.equal(await pending, false);
  const courses = nodes(h.render()).find(n => n.type === '../components/lists/ListCourses');
  assert.equal(courses.props.list.name, 'bob');
});

test('le détail propose une seule action de recalcul et adopte directement le résultat serveur', async () => {
  const result = { ...fixture(), status: 'active', revision: 9, totals: { ...fixture().totals, budget_known_amount: '6.00' } };
  const h = listScreen({ result: () => result }); await h.ready();
  assert.equal(button(h, 'Comparer les magasins'), undefined);
  assert.equal(button(h, 'Comparer les achats'), undefined);
  assert.equal(nodes(h.render()).filter(n => n.props.title === 'Recalculer les prix').length, 1);
  button(h, 'Recalculer les prix').props.onPress(); await flush();
  assert.equal(h.commands.length, 1);
  assert.equal(h.commands[0].path, '/api/v1/shopping-lists/list/recalculate-prices');
  assert.deepEqual(json(h.commands[0].body), { expected_revision: 8 });
  const courses = nodes(h.render()).find(n => n.type === '../components/lists/ListCourses');
  assert.equal(courses.props.list.totals.budget_known_amount, '6.00');
});
