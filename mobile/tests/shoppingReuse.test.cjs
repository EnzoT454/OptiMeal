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
      recalculatePricesCommand: (list, options = {}) => ({ key: 'recalculate', path: `/api/v1/shopping-lists/${list.id}/recalculate-prices`, method: 'POST', body: { expected_revision: list.revision, ...options } }),
      listCommand: (path, body, method = 'POST') => ({ key: 'stable-key', path, body, method }),
      fetchList: async (...args) => { reads.push('current'); return options.fetchList ? options.fetchList(...args) : source; },
      fetchLists: async (offset, collection) => { reads.push({ offset, collection }); return pages; },
    };
    if (name.endsWith('shoppingReuse')) return { templatesPath: '/api/v1/shopping-list-templates', exclusionsPath: '/api/v1/shopping-list-exclusions',
      templateIcons: { basket: '🧺', cart: '🛒', leaf: '🌿', restaurant: '🍽', home: '🏠' }, timestampLabel: v => v,
      fetchTemplate: async () => { if (options.templateUnavailable) throw new Error('Modèle introuvable.'); return template; },
    };
    if (name.endsWith('shoppingNavigation')) {
      const result = {};
      vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../services/shoppingNavigation.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: result });
      return result;
    }
    if (name.endsWith('shoppingPresentation')) return require('./helpers/loadShoppingPresentation.cjs')();
      if (name.endsWith('courseQuantities')) return { positiveAmount: value => { const normalized = value.replace(',', '.'); return /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(normalized) && /[1-9]/.test(normalized) ? normalized : null; } };
    if (name.endsWith('/api')) return { api: async () => ({ items: [] }) };
    if (name.endsWith('/recipes')) return { RecipeButton: 'Button', RecipeField: 'Field', RecipeScreen: 'Screen', RecipeTitle: 'Title', recipeStyles: {}, recipeColors: {} };
    if (name.endsWith('/ui')) return { Message: 'Message' };
    return { __esModule: true, default: name, ListDateField: 'ListDateField' };
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: requireMock, Date, Object, Error });
  const navigation = { reset: state => navigations.push(['reset', state]), navigate: (...args) => navigations.push(args), replace: (...args) => navigations.push(args), push: (...args) => navigations.push(args), setOptions: value => Object.assign(headerOptions, value), goBack: () => navigations.push(['back']) };
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

test('sauvegarder une liste de produits demande des articles sans préférence commerciale', async () => {
  const h = screen('app/ShoppingReuseScreen.tsx', { source: { ...fixture(), kind: 'products' }, props: { route: { params: { id: 'list', revision: 8, mode: 'template' } } } });
  await h.ready();
  assert.equal(checkbox(h), undefined);
  await button(h, 'Enregistrer dans mes listes').props.onPress();
  assert.equal(h.commands[0].body.include_choices, false);
  assert.equal(h.commands[0].body.source_list_id, 'list');
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
  assert.equal(h.header().props.accessibilityLabel, 'Options de la liste sauvegardée');
  assert.equal(button(h, 'Supprimer la liste sauvegardée'), undefined);
  assert.equal(button(h, 'Modifier le modèle'), undefined);
  assert.equal(button(h, 'Créer une liste depuis ce modèle'), undefined);
  assert.equal(field(h, 'Nom de la nouvelle liste'), undefined);
  assert.equal(nodes(h.render()).some(n => n.type === 'ListDateField'), false);
  assert.ok(nodes(h.render()).some(n => n.props.accessibilityLabel === 'Modifier Riz'));
  openMenu(h);
  for (const title of ['Modifier le nom', 'Supprimer la liste sauvegardée', 'Ajouter un article']) assert.ok(button(h, title));
  button(h, 'Fermer').props.onPress();
  assert.equal(button(h, 'Supprimer la liste sauvegardée'), undefined);
});

test('renommer un modèle ne renvoie ni ses produits ni son icône', async () => {
  const h = modelScreen(); await h.ready(); openMenu(h);
  button(h, 'Modifier le nom').props.onPress();
  field(h, 'Nom de la liste sauvegardée').props.onChangeText('Barbecue');
  await button(h, 'Enregistrer le nom').props.onPress(); await flush();
  assert.equal(h.commands[0].method, 'PATCH');
  assert.deepEqual(json(h.commands[0].body), { expected_revision: 2, name: 'Barbecue' });
  assert.equal(h.template.name, 'Hebdomadaire');
});

test('Ajouter un article ouvre la barre de recherche et adopte seulement le résultat serveur', async () => {
  const template = templateFixture();
  const h = modelScreen({ template, result: command => ({ ...template, revision: 3, items: command.body.items }) }); await h.ready(); openMenu(h);
  button(h, 'Ajouter un article').props.onPress();
  const quick = () => nodes(h.render()).find(n => n.type === '../components/lists/ListQuickAdd');
  assert.ok(quick()); assert.equal(quick().props.autoFocus, true);
  assert.equal(field(h, 'Article'), undefined); assert.equal(button(h, 'Choisir dans le catalogue'), undefined);
  const added = { id: 'new', name: 'Serviettes', ingredient_id: null, category: 'Autres', required: [], preferred_product_id: null };
  const saved = await quick().props.onCommand({ key: 'add-key', method: 'PATCH', path: '/api/v1/shopping-list-templates/template', body: { expected_revision: 2, items: [...template.items, added] } });
  assert.equal(saved, true); assert.equal(h.commands[0].method, 'PATCH');
  assert.equal(quick().props.template.items.length, 2); assert.equal(template.items.length, 1);
  quick().props.onDone(); assert.equal(quick(), undefined);
});

test('une quantité invalide en édition garde l’article et bloque l’enregistrement', async () => {
  const h = modelScreen(); await h.ready();
  nodes(h.render()).find(n => n.props.accessibilityLabel === 'Modifier Riz').props.onPress();
  field(h, 'Quantité (facultative)').props.onChangeText('-5');
  await button(h, 'Enregistrer l’article').props.onPress();
  assert.equal(h.commands.length, 0); assert.ok(nodes(h.render()).some(n => n.props.accessibilityRole === 'alert'));
  button(h, 'Annuler').props.onPress(); assert.equal(field(h, 'Article'), undefined);
});

test('modifier un article conserve les dimensions et retire une ancienne préférence produit', async () => {
  const template = templateFixture();
  template.items[0].required.push({ amount: '2', unit: 'unit' });
  template.items[0].preferred_product_id = 'maxi:1:rice';
  const h = modelScreen({ template }); await h.ready();
  nodes(h.render()).find(n => n.props.accessibilityLabel === 'Modifier Riz').props.onPress();
  field(h, 'Quantité (facultative)').props.onChangeText('750');
  nodes(h.render()).find(n => n.props.allowedUnits).props.onChange('g');
  await button(h, 'Enregistrer l’article').props.onPress(); await flush();
  assert.deepEqual(json(h.commands[0].body.items[0].required), [{ amount: '2', unit: 'unit' }, { amount: '750', unit: 'g' }]);
  assert.equal(h.commands[0].body.items[0].preferred_product_id, null);
  assert.equal(template.items[0].required[0].amount, '500');
});

test('retirer les quantités est explicite et ne retire pas le produit', async () => {
  const h = modelScreen(); await h.ready();
  nodes(h.render()).find(n => n.props.accessibilityLabel === 'Modifier Riz').props.onPress();
  button(h, 'Retirer les quantités').props.onPress();
  await button(h, 'Enregistrer l’article').props.onPress(); await flush();
  assert.equal(h.commands[0].body.items[0].required.length, 0);
  assert.equal(h.commands[0].body.items[0].id, 'item');
  assert.equal(h.template.items[0].required[0].amount, '500');
});

for (const kind of [undefined, null, 'products']) test(`suppression sauvegarde ${kind ?? 'ancienne'} : confirmation dans l’écran puis DELETE révisionné`, async () => {
  const template = { ...templateFixture(), kind };
  const h = modelScreen({ template, result: () => ({ ...template, revision: 3, deleted: true }) }); await h.ready(); openMenu(h);
  button(h, 'Supprimer la liste sauvegardée').props.onPress();
  assert.equal(h.commands.length, 0); assert.equal(h.alerts.length, 0);
  assert.ok(button(h, 'Annuler'));
  assert.equal(nodes(h.render()).some(n => n.props.accessibilityViewIsModal), false);
  await button(h, 'Supprimer la liste sauvegardée').props.onPress(); await flush();
  assert.equal(h.commands[0].method, 'DELETE');
  assert.equal(h.commands[0].path, '/api/v1/shopping-list-templates/template');
  assert.deepEqual(json(h.commands[0].body), { expected_revision: 2 });
  assert.deepEqual(json(h.navigations), [['back']]);
});

test('annuler la suppression d’une ancienne sauvegarde ne transmet aucune commande', async () => {
  const h = modelScreen(); await h.ready(); openMenu(h);
  button(h, 'Supprimer la liste sauvegardée').props.onPress();
  button(h, 'Annuler').props.onPress();
  assert.equal(h.commands.length, 0); assert.equal(button(h, 'Annuler'), undefined);
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
  // « Rétablir » est un lien ; on le trouve par son nom pour les lecteurs d'écran
  await nodes(h.render()).find(n => n.props.accessibilityLabel === 'Suggérer à nouveau Riz').props.onPress();
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
  assert.equal(button(h, 'Modifier'), undefined);
  assert.ok(button(h, 'Rouvrir la liste'));
  button(h, 'Enregistrer dans mes listes').props.onPress();
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
  for (const title of ['Renommer la liste', 'Enregistrer dans mes listes', 'Marquer comme terminée']) assert.ok(button(h, title));
  const pin = nodes(h.render()).find(n => n.type === '../components/lists/PinListAction');
  assert.equal(pin.props.id, 'list'); assert.equal(pin.props.disabled, false);
});
test('le menu permet de modifier le nom et la date avec la révision courante', async () => {
  const h = listScreen(); await h.ready(); openMenu(h);
  button(h, 'Renommer la liste').props.onPress();
  assert.equal(button(h, 'Modifier'), undefined);
  field(h, 'Nouveau nom').props.onChangeText('Barbecue');
  await button(h, 'Enregistrer le nom').props.onPress(); await flush();
  assert.equal(h.commands[0].path, '/api/v1/shopping-lists/list');
  assert.equal(h.commands[0].method, 'PATCH');
  assert.deepEqual(json(h.commands[0].body), { expected_revision: 8, name: 'Barbecue' });
});
test('terminer avec des éléments restants confirme dans l’écran puis masque la copie', async () => {
  const source = { ...fixture(), status: 'active', origin: { kind: 'template', id: 'saved-template' }, totals: { ...fixture().totals, remaining_item_count: 1 } };
  const h = listScreen({ source, result: () => ({ ...source, status: 'completed', revision: 9 }) }); await h.ready(); openMenu(h);
  button(h, 'Marquer comme terminée').props.onPress();
  assert.equal(h.commands.length, 0); assert.equal(h.alerts.length, 0);
  assert.ok(button(h, 'Continuer les courses'));
  await button(h, 'Terminer quand même').props.onPress(); await flush();
  assert.equal(h.commands[0].path, '/api/v1/shopping-lists/list/complete');
  assert.deepEqual(json(h.commands[0].body), { expected_revision: 8, accept_remaining: true });
  assert.deepEqual(json(h.navigations[0]), ['Lists', { section: 'recent' }]);
  assert.equal(h.commands.some(c => c.path.includes('shopping-list-templates')), false);
});
test('le menu allégé se ferme en touchant le fond et ne propose ni Modifier ni Fermer', async () => {
  const h = listScreen(); await h.ready(); openMenu(h);
  assert.equal(button(h, 'Modifier'), undefined); assert.equal(button(h, 'Fermer'), undefined);
  nodes(h.render()).find(n => n.props.accessibilityLabel === 'Fermer les options de la liste').props.onPress();
  assert.equal(button(h, 'Renommer la liste'), undefined);
  openMenu(h);
  nodes(h.render()).find(n => n.props.accessibilityViewIsModal).props.onAccessibilityEscape();
  assert.equal(button(h, 'Renommer la liste'), undefined);
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
  await h.ready();
  const courses = nodes(h.render()).find(n => n.type === '../components/lists/ListCourses');
  const pending = courses.props.onCommand({ key: 'add', path: '/items', method: 'POST', body: {} });
  h.auth.session = { user: { id: 'bob' } }; await h.ready();
  finish({ ...fixture(), revision: 9, name: 'alice-private' });
  assert.equal(await pending, false);
  const updatedCourses = nodes(h.render()).find(n => n.type === '../components/lists/ListCourses');
  assert.equal(updatedCourses.props.list.name, 'bob');
});

test('actualiser les prix est réservé aux produits et désactivé pendant les ajouts', async () => {
  const source = { ...fixture(), kind: 'products', status: 'active' };
  const h = listScreen({ source }); await h.ready();
  const quick = () => nodes(h.render()).find(n => n.type === '../components/lists/ListQuickAdd');
  assert.ok(button(h, 'Actualiser les prix')); assert.equal(button(h, 'Comparer les prix'), undefined);
  quick().props.onEditingChange(true);
  assert.equal(button(h, 'Actualiser les prix').props.disabled, true);
  quick().props.onEditingChange(false);
  assert.equal(button(h, 'Actualiser les prix').props.disabled, false);
  await button(h, 'Actualiser les prix').props.onPress();
  assert.deepEqual(json(h.commands[0].body), { expected_revision: 8, refresh_date: true });
  const articles = listScreen({ source: { ...fixture(), kind: 'articles', status: 'active' } }); await articles.ready();
  assert.equal(button(articles, 'Actualiser les prix'), undefined);
  assert.equal(nodes(articles.render()).some(n => n.type === 'ListDateField'), false);
});


test('le détail réserve le statut au résumé et place la note des prix après les courses', async () => {
  const h = listScreen({ source: { ...fixture(), kind: 'products', status: 'active' } }); await h.ready();
  const all = nodes(h.render());
  const body = all.flatMap(n => [].concat(n.props.children ?? [])).filter(v => typeof v === 'string').join(' ');
  assert.doesNotMatch(body, /Liste en cours|Liste de produits|prix estimés/);
  assert.ok(all.some(n => n.props.list?.id === 'list'));
  assert.ok(all.findIndex(n => n.type === '../components/lists/ShoppingPriceNotice') > all.findIndex(n => n.type === '../components/lists/ListCourses'));
});


test('Terminer la liste apparaît à zéro restant, avant les prix, et conserve les achats', async () => {
  const source = { ...fixture(), kind: 'products', status: 'active' };
  const h = listScreen({ source, result: () => ({ ...source, revision: 9, status: 'completed' }) }); await h.ready();
  const all = nodes(h.render());
  assert.ok(all.findIndex(n => n.props.title === 'Terminer la liste') < all.findIndex(n => n.props.title === 'Actualiser les prix'));
  await button(h, 'Terminer la liste').props.onPress(); await flush();
  assert.equal(h.commands[0].path, '/api/v1/shopping-lists/list/complete');
  assert.deepEqual(json(h.commands[0].body), { expected_revision: 8, accept_remaining: false });
  assert.equal(button(h, 'Terminer la liste'), undefined);
  assert.equal(button(h, 'Actualiser les prix'), undefined);
});

test('Terminer la liste n’est pas proposé sur une liste vide, incomplète ou déjà terminée', async () => {
  for (const source of [
    { ...fixture(), status: 'active', totals: { ...fixture().totals, item_count: 0 } },
    { ...fixture(), status: 'active', totals: { ...fixture().totals, remaining_item_count: 1 } },
    fixture(),
  ]) {
    const h = listScreen({ source }); await h.ready();
    assert.equal(button(h, 'Terminer la liste'), undefined);
  }
});


test('Utiliser cette liste instancie une copie active et ouvre son propre identifiant', async () => {
  const template = templateFixture();
  const h = modelScreen({ template, result: command => command.path.endsWith('/instantiate') ? { ...fixture(), id: 'new-copy', status: 'active' } : null }); await h.ready();
  await button(h, 'Utiliser cette liste').props.onPress(); await flush();
  assert.equal(h.commands[0].path, '/api/v1/shopping-list-templates/template/instantiate');
  assert.equal(h.commands[0].body.activate, true);
  assert.deepEqual(json(h.navigations[0]), ['reset', { index: 1, routes: [{ name: 'Lists', params: { section: 'recent' } }, { name: 'ShoppingDetail', params: { id: 'new-copy' } }] }]);
  assert.equal(template.deleted, false);
});


test('copie de produits : une invitation à actualiser remplace les avertissements par produit puis disparaît', async () => {
  const warnings = Array.from({ length: 3 }, () => ({ code: 'COPY_PRODUCT_CHOICES', message: 'Choix de produit conservé ; compare pour vérifier.' }));
  warnings.push({ code: 'COVERAGE_NEEDS_REVIEW', message: 'Vérifier la quantité achetée.' });
  const source = { ...fixture(), kind: 'products', status: 'active', warnings };
  const h = listScreen({ source, result: () => ({ ...source, revision: 9, assignment: { stale: false, scenario: { needs: [] } } }) }); await h.ready();
  const content = () => nodes(h.render()).flatMap(n => [].concat(n.props.children ?? [])).filter(v => typeof v === 'string').join(' ');
  assert.equal((content().match(/Veuillez actualiser les prix\./g) ?? []).length, 1);
  assert.doesNotMatch(content(), /Choix de produit conservé/);
  assert.match(content(), /Vérifier la quantité achetée/);
  await button(h, 'Actualiser les prix').props.onPress(); await flush();
  assert.doesNotMatch(content(), /Veuillez actualiser les prix|Choix de produit conservé/);
  assert.match(content(), /Vérifier la quantité achetée/);
});


test('exclure un produit confirme la portée compte et retire seulement après sauvegarde de la préférence', async () => {
  let removed = 0;
  const h = screen('components/lists/ListExclusionAction.tsx', { result: () => ({ excluded: true }),
    props: { ingredientId: 'ing_riz', name: 'Riz', disabled: false, onExcluded: async () => { removed++; return true; } } });
  button(h, 'Ne plus suggérer').props.onPress();
  assert.match(JSON.stringify(h.render()), /menu de compte/); assert.match(JSON.stringify(h.render()), /retiré de cette liste/);
  assert.equal(removed, 0); assert.equal(h.commands.length, 0);
  button(h, 'Confirmer').props.onPress(); await flush(); assert.equal(removed, 1);
  assert.deepEqual(json(h.commands[0].body), { excluded: true });
});

test('une préférence refusée ne retire pas le produit et un retrait refusé reste reprenable', async () => {
  let removed = 0;
  const props = { ingredientId: 'ing_riz', name: 'Riz', disabled: false, onExcluded: async () => { removed++; return false; } };
  const failure = screen('components/lists/ListExclusionAction.tsx', { props });
  button(failure, 'Ne plus suggérer').props.onPress(); button(failure, 'Confirmer').props.onPress(); await flush();
  assert.equal(removed, 0);
  const h = screen('components/lists/ListExclusionAction.tsx', { props, result: () => ({ excluded: true }) });
  button(h, 'Ne plus suggérer').props.onPress(); button(h, 'Confirmer').props.onPress(); await flush();
  assert.equal(removed, 1); button(h, 'Retirer le produit exclu de cette liste').props.onPress(); await flush();
  assert.equal(removed, 2); assert.equal(h.commands.length, 1);
});