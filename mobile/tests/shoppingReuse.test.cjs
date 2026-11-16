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
  const source = options.source ?? fixture(), template = templateFixture();
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
      useRef(current) { const i = cursor++; return hooks[i] ??= { current }; }, useCallback: memo };
    if (name === '@react-navigation/native') return { useFocusEffect(fn) { const i = cursor++; if (!hooks[i] || hooks[i].fn !== fn) {
      effects.push(() => { hooks[i]?.cleanup?.(); hooks[i] = { fn, cleanup: fn() }; });
    } } };
    if (name === 'react-native') return { Text: 'Text', View: 'View', ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', Alert: { alert: (...args) => alerts.push(args) } };
    if (name === 'expo-crypto') return { randomUUID: () => `uuid-${++sequence}` };
    if (name.includes('AuthContext')) return { useAuth: () => auth };
    if (name.endsWith('useListCommand')) return methods;
    if (name.endsWith('useShoppingPage')) return { useShoppingPage: () => ({ ...pages, loading: false, error: '', load: async () => {} }) };
    if (name.endsWith('shoppingLists')) return { listsPath: '/api/v1/shopping-lists', localDate: () => '2026-11-20',
      quantityLabel: values => values.map(v => `${v.amount} ${v.unit}`).join(' + '), dateLabel: v => v,
      listCommand: (path, body, method = 'POST') => ({ key: 'stable-key', path, body, method }),
      fetchList: async () => { reads.push('current'); return source; },
      fetchLists: async (offset, collection) => { reads.push({ offset, collection }); return pages; },
    };
    if (name.endsWith('shoppingReuse')) return { templatesPath: '/api/v1/shopping-list-templates', exclusionsPath: '/api/v1/shopping-list-exclusions',
      templateIcons: { basket: '🧺', cart: '🛒', leaf: '🌿', restaurant: '🍽', home: '🏠' }, timestampLabel: v => v,
      fetchRevision: async (id, revision) => { reads.push({ id, revision }); return { snapshot: source }; },
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
  const navigation = { navigate: (...args) => navigations.push(args), replace: (...args) => navigations.push(args), push: (...args) => navigations.push(args), goBack: () => navigations.push(['back']) };
  function render(next = props) { props = next; cursor = 0; const tree = exports.default({ navigation, ...props }); while (effects.length) effects.shift()(); return tree; }
  return { render, async ready() { render(); await flush(); return render(); }, commands, navigations, alerts, reads, template, auth };
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

test('le modèle modifié transmet une révision et des besoins, sans altérer une instance', async () => {
  const h = screen('app/ShoppingTemplateDetailScreen.tsx', { props: { route: { params: { id: 'template' } } } });
  await h.ready(); button(h, 'Modifier le modèle').props.onPress();
  field(h, 'Nom du modèle').props.onChangeText('Modèle changé');
  button(h, 'Retirer les quantités de Riz').props.onPress();
  await button(h, 'Enregistrer les modifications du modèle').props.onPress();
  assert.equal(h.commands[0].method, 'PATCH');
  assert.equal(h.commands[0].body.expected_revision, 2);
  assert.equal(h.commands[0].body.items[0].required.length, 0);
  assert.equal(h.template.items[0].required[0].amount, '500');
});

test('utiliser un modèle conserve sa version attendue et une nouvelle date', async () => {
  const h = screen('app/ShoppingTemplateDetailScreen.tsx', { props: { route: { params: { id: 'template' } } }, result: () => ({ id: 'new', status: 'draft' }) });
  await h.ready(); await button(h, 'Créer une liste depuis ce modèle').props.onPress();
  assert.deepEqual(json(h.commands[0].body), { expected_template_revision: 2, name: 'Hebdomadaire', purchase_date: '2026-11-20', include_choices: false });
  assert.equal(h.commands[0].path, '/api/v1/shopping-list-templates/template/instantiate');
});

test('supprimer un modèle demande confirmation et transmet une révision sans supprimer une liste', async () => {
  const h = screen('app/ShoppingTemplateDetailScreen.tsx', { props: { route: { params: { id: 'template' } } } });
  await h.ready(); button(h, 'Supprimer le modèle').props.onPress();
  assert.equal(h.commands.length, 0);
  assert.equal(h.alerts[0][2][0].text, 'Annuler');
  await h.alerts[0][2][1].onPress();
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

test('la consultation historique charge la révision figée et masque les mutations de liste', async () => {
  const historical = { ...fixture(), status: 'active' };
  const h = screen('app/ShoppingListDetailScreen.tsx', { source: historical, props: { route: { params: { id: 'list', revision: 8 } } } });
  await h.ready();
  assert.deepEqual(h.reads[0], { id: 'list', revision: 8 });
  assert.equal(button(h, 'Terminer les courses'), undefined);
  assert.equal(button(h, 'Ajouter un article'), undefined);
  button(h, 'Options de la liste').props.onPress();
  assert.equal(button(h, 'Archiver la liste'), undefined);
  assert.equal(button(h, 'Renommer la liste'), undefined);
  button(h, 'Copier les besoins').props.onPress();
  assert.deepEqual(json(h.navigations[0]), ['ReuseList', { id: 'list', revision: 8, mode: 'copy' }]);
});

test('En cours et Historique interrogent des collections différentes sans modifier les listes', async () => {
  const h = screen('app/ListScreen.tsx', { pages: { items: [], total: 0 } });
  await h.ready();
  assert.equal(h.reads[0].collection, 'current');
  button(h, 'Historique').props.onPress(); await h.ready();
  assert.equal(h.reads.at(-1).collection, 'history');
  assert.equal(h.commands.length, 0);
});


test('une suppression avec réponse perdue est reprise même si le modèle est maintenant introuvable', async () => {
  const pending = { key: 'delete-key', method: 'DELETE', path: '/api/v1/shopping-list-templates/template', body: { expected_revision: 2 } };
  const h = screen('app/ShoppingTemplateDetailScreen.tsx', { props: { route: { params: { id: 'template' } } },
    templateUnavailable: true, pending, result: () => ({ id: 'template', revision: 3, deleted: true }) });
  await h.ready();
  await button(h, 'Reprendre le modèle').props.onPress(); await flush();
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
