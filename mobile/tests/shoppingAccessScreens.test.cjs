const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const tick = () => new Promise(resolve => setImmediate(resolve));
function screen(file, options = {}) {
  const slots = [], effects = [], calls = [], navigations = [];
  let index = 0, user = 'alice', props = options.props ?? {};
  const list = { id: 'selected', revision: 8, name: 'Semaine future', status: 'active', purchase_date: '2027-01-04',
    period: { start_date: '2027-01-04', end_date: '2027-01-10' }, totals: { item_count: 4, remaining_item_count: 2, purchased_item_count: 1, owned_item_count: 1,
      budget_known_amount: '19.90', remaining_known_amount: '9.95', unpriced_item_count: 1, estimate_complete: false } };
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, Error, Date, require(name) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'react') return {
        useState(initial) { const i = index++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
          return [slots[i].value, v => { slots[i].value = typeof v === 'function' ? v(slots[i].value) : v; }]; },
        useRef(current) { const i = index++; return slots[i] ??= { current }; },
        useEffect(fn, deps) { const i = index++; if (!slots[i] || deps.some((v, n) => v !== slots[i].deps[n])) { const old = slots[i]; slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } },
        useCallback(fn, deps) { const i = index++; if (!slots[i] || deps.some((v, n) => v !== slots[i].deps[n])) slots[i] = { fn, deps }; return slots[i].fn; },
      };
      if (name === '@react-navigation/native') return {
        useNavigation: () => ({ navigate: (...args) => navigations.push(args) }),
        useFocusEffect(fn) { const i = index++; if (slots[i]?.fn !== fn) { const old = slots[i]; slots[i] = { fn }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } },
      };
      if (name === 'react-native') return { Text: 'Text', View: 'View', Pressable: 'Pressable', ActivityIndicator: 'Spinner', Alert: { alert: (...args) => calls.push(['alert', ...args]) } };
      if (name.endsWith('AuthContext')) return { useAuth: () => ({ session: user ? { user: { id: user } } : null }) };
      if (name.endsWith('useListCommand')) return { useListCommand: scope => ({ ready: true, busy: false, pending: options.pending ?? null, error: '', locked: false,
        run: async command => { calls.push(['command', scope, command]); return options.result ?? { list_id: 'selected', id: 'saved' }; } }) };
      if (name.endsWith('InstantListCreation')) return { __esModule: true, default: 'InstantCreate' };
      if (name.endsWith('CreationPrices')) return { __esModule: true, default: 'CreationPrices' };
      if (name.endsWith('IngredientPicker') || name.endsWith('RecipeUnitPicker')) return { __esModule: true, default: name };
      if (name.endsWith('courseQuantities')) return { positiveAmount: value => /^([1-9][0-9]*)([.,][0-9]+)?$/.test(value) ? value.replace(',', '.') : null };
      if (name.endsWith('/api')) return { api: async () => ({ items: [] }) };
      if (name.endsWith('ListDateField')) return { ListDateField: 'DateField' };
      if (name.endsWith('shoppingAccess')) return {
        loadPinnedList: async account => { calls.push(['pinned', account]); if (options.load) return options.load(account); return list; },
        fetchPin: async () => { calls.push(['read-pin']); return { list_id: list.id }; }, pinPath: '/api/v1/shopping-list-pin',
      };
      if (name.endsWith('useShoppingPage')) return { useShoppingPage: (scope, fetch) => { calls.push(['scope', scope, fetch]); return { items: [list], total: 1, loading: false, error: '', load: async () => {} }; } };
      if (name.endsWith('/recipes')) return { RecipeButton: 'Button', RecipeField: 'Field', RecipeScreen: 'Screen', RecipeTitle: 'Title', recipeStyles: {}, recipeColors: {} };
      if (name.endsWith('/ui')) return { Message: 'Message' };
      if (name.endsWith('shoppingLists')) return { listsPath: '/api/v1/shopping-lists', quantityLabel: values => values.map(q => `${q.amount} ${q.unit}`).join(' + '), dateLabel: x => x, localDate: () => '2026-11-16', currentWeek: () => ({ start_date: '2026-11-16', end_date: '2026-11-22' }),
        previewCreationPrices: async (body, user) => { calls.push(['prices', body, user]); if (options.priceLoad) return options.priceLoad(body, user); return options.quote ?? { fingerprint: 'quoted-prices', scenarios: ['maxi', 'metro', 'superc', 'cheapest'].map(scenario => ({ scenario, complete: true, needs: [], known_amount: '6.00', store_totals: [], store_count: 0 })), candidates: [] }; },
        previewCalendar: async body => { calls.push(['preview', body]); return options.preview ?? null; },
        fetchLists: async (...args) => calls.push(['lists', ...args]),
        listCommand: (path, body, method) => ({ key: 'stable', path, body, method }) };
      if (name.endsWith('ListSummaryRow')) return { __esModule: true, default: 'ListSummaryRow' };
      if (name.endsWith('SavedListCard')) return { __esModule: true, default: 'SavedListCard' };
      throw new Error(name);
    },
  });
  const render = () => { index = 0; let tree = exports.default(props); if (typeof tree?.type === 'function') tree = tree.type(tree.props); return tree; };
  return { render, calls, list, navigations, set user(value) { user = value; },
    async ready() { render(); effects.splice(0).forEach(fn => fn()); await tick(); return render(); } };
}
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
const text = tree => nodes(tree).flatMap(n => [].concat(n.props.children ?? [])).filter(n => typeof n === 'string').join(' ');
test('Accueil utilise le même résumé compact que Liste et ouvre la liste épinglée', async () => {
  const opened = [], h = screen('components/lists/PinnedShoppingList.tsx', { props: { onOpen: id => opened.push(id), onLists() {} } });
  await h.ready(); const card = nodes(h.render()).find(n => n.type === 'ListSummaryRow');
  assert.equal(card.props.list.revision, 8); assert.doesNotMatch(text(h.render()), /Hors connexion|synchronisation|en attente/);
  card.props.onPress(); assert.deepEqual(opened, ['selected']);
});
test('changement de compte masque la carte avant le chargement du nouveau compte', async () => {
  const h = screen('components/lists/PinnedShoppingList.tsx', { props: { onOpen() {}, onLists() {} } });
  await h.ready(); h.user = 'bob';
  assert.equal(nodes(h.render()).some(n => n.type === 'ListSummaryRow'), false);
});
test('réponse tardive d’un ancien compte n’écrase pas le nouvel accueil', async () => {
  let finish;
  const h = screen('components/lists/PinnedShoppingList.tsx', { load: account => account === 'alice' ? new Promise(resolve => { finish = resolve; }) : null, props: { onOpen() {}, onLists() {} } });
  await h.ready(); h.user = 'bob'; await h.ready(); finish(h.list); await tick();
  assert.equal(nodes(h.render()).some(n => n.type === 'ListSummaryRow'), false);
});
test('Calendrier charge la période explicite, puis ouvre exactement la liste proposée', async () => {
  const opened = [], period = { start_date: '2027-01-04', end_date: '2027-01-10' };
  const h = screen('components/lists/CalendarLists.tsx', { props: { period, onCreate() {}, onOpen: id => opened.push(id) } });
  h.render(); const scope = h.calls.find(c => c[0] === 'scope');
  assert.equal(scope[1], 'calendar:2027-01-04:2027-01-10'); await scope[2](20);
  const call = h.calls.find(c => c[0] === 'lists'); assert.equal(call[1], 20); assert.equal(call[3], period); assert.equal(call[4], 'alice');
  nodes(h.render()).find(n => n.type === 'SavedListCard').props.onOpen(); assert.deepEqual(opened, ['selected']);
});
test('résumé commun : compteurs accessibles avec icônes et statut dans le bloc', () => {
  const source = fs.readFileSync(path.join(__dirname, '../components/lists/SavedListCard.tsx'), 'utf8');
  const exports = {}, jsx = (type, props) => ({ type, props });
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require(name) {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react-native') return { Text: 'Text', View: 'View', Pressable: 'Pressable' };
    if (name.includes('@expo/vector-icons')) return { __esModule: true, default: 'Icon' };
    if (name.endsWith('/recipes')) return { recipeStyles: {}, recipeColors: {} };
    if (name.endsWith('shoppingPresentation')) return require('./helpers/loadShoppingPresentation.cjs')();
    if (name.endsWith('ShoppingPriceSummary')) return { __esModule: true, default: 'PriceSummary' };
    return { dateLabel: x => x };
  } });
  const h = screen('components/lists/CalendarLists.tsx', { props: { period: { start_date: '', end_date: '' } } });
  const list = { ...h.list, kind: 'products', totals: { ...h.list.totals, unpriced_item_count: 2 } };
  const tree = exports.SavedListTotals({ list });
  assert.equal(nodes(tree).find(n => n.type === 'PriceSummary').props.list, list);
  assert.match(text(tree), /Liste en cours/);
  for (const label of ['4 produits', '2 à acheter', '1 achetés', '1 disponibles', '0 magasins', '2 sans prix']) assert.ok(nodes(tree).some(n => n.props.accessibilityLabel === label));
  assert.equal(nodes(tree).filter(n => n.type === 'Icon').length, 7);
  const articles = exports.SavedListTotals({ list: { ...list, kind: 'articles' } });
  assert.equal(nodes(articles).some(n => n.type === 'PriceSummary'), false);
});

test('épinglage : état cible explicite, commande privée et relecture après réponse', async () => {
  const h = screen('components/lists/PinListAction.tsx', { props: { id: 'selected', disabled: false } });
  await h.ready();
  assert.doesNotMatch(text(h.render()), /Cette liste est épinglée/);
  nodes(h.render()).find(n => n.props.title === 'Ne plus épingler sur Accueil').props.onPress(); await tick();
  const [, scope, command] = h.calls.find(c => c[0] === 'command');
  assert.equal(scope, 'pin'); assert.equal(command.method, 'PUT'); assert.equal(command.body.list_id, null);
  assert.equal(h.calls.filter(c => c[0] === 'read-pin').length, 2);
});
test('épinglage incertain : reprendre exactement l’ancienne cible, même depuis une autre liste', async () => {
  const pending = { key: 'lost', method: 'PUT', path: '/api/v1/shopping-list-pin', body: { list_id: 'original' } };
  const h = screen('components/lists/PinListAction.tsx', { pending, props: { id: 'selected', disabled: false } });
  await h.ready(); nodes(h.render()).find(n => n.props.title === 'Reprendre l’épinglage').props.onPress(); await tick();
  assert.equal(h.calls.find(c => c[0] === 'command')[2], pending);
});
const button = (h, title) => nodes(h.render()).find(n => n.props.title === title);
const field = (h, label) => nodes(h.render()).find(n => n.props.label === label);
function calendar(options = {}) {
  const period = { start_date: '2027-01-04', end_date: '2027-01-10' };
  const preview = { period, preview_fingerprint: 'proof', included_meal_count: 1, skipped_note_count: 1,
    skipped_leftover_count: 1, excluded_meals: [], excluded_ingredient_ids: [], warnings: [],
    items: [{ id: 'rice', name: 'Riz', ingredient_id: 'ing_riz', required: [{ amount: '500', unit: 'g' }], contributions: [] }] };
  return screen('app/CreateListScreen.tsx', { preview, ...options, props: { route: { params: { period } }, navigation: { replace() {} } } });
}
test('calendrier : période transmise et création sans seconde revue de prix', async () => {
  const h = calendar(); await h.ready();
  assert.equal(field(h, 'Premier jour inclus'), undefined);
  assert.equal(field(h, 'Dernier jour inclus'), undefined);
  field(h, 'Quantité de Riz (g)').props.onChangeText('750');
  button(h, 'Créer la liste').props.onPress(); await tick();
  const intent = h.calls.find(c => c[0] === 'command')[2];
  assert.equal(intent.path, '/api/v1/shopping-lists/from-calendar');
  assert.equal(intent.body.start_date, '2027-01-04');
  assert.equal(intent.body.adjusted_items[0].required[0].amount, '750');
  assert.equal(intent.body.activate, true);
  assert.equal(intent.body.pricing, undefined);
  assert.equal(h.calls.filter(c => c[0] === 'prices').length, 0);
});
test('calendrier : une quantité incorrecte conserve le contexte et bloque la sauvegarde', async () => {
  const h = calendar(); await h.ready();
  field(h, 'Quantité de Riz (g)').props.onChangeText('-1');
  button(h, 'Créer la liste').props.onPress(); await tick();
  assert.equal(h.calls.filter(c => c[0] === 'command').length, 0);
  assert.equal(field(h, 'Quantité de Riz (g)').props.value, '-1');
  assert.match(text(h.render()), /Vérifie les quantités/);
});
test('calendrier : retirer le seul besoin ne produit pas une copie sans provenance fictive', async () => {
  const h = calendar(); await h.ready();
  button(h, 'Retirer Riz de l’aperçu').props.onPress();
  assert.equal(button(h, 'Créer la liste').props.disabled, true);
  assert.equal(h.calls.filter(c => c[0] === 'command').length, 0);
});

// La création manuelle et calendrier n’imposent aucun choix de prix.
test('création instantanée : une commande active vide, sans devis ni choix de prix', async () => {
  const ids = [];
  const h = screen('components/lists/InstantListCreation.tsx', { props: { onCreated: id => ids.push(id) } });
  await h.ready(); await tick();
  const calls = h.calls.filter(c => c[0] === 'command');
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][2].body)), { kind: 'articles', name: 'Mes courses', activate: true, items: [] });
  assert.deepEqual(ids, ['saved']);
  await h.ready();
  assert.equal(h.calls.filter(c => c[0] === 'command').length, 1);
});
test('création instantanée : une commande restaurée attend la reprise explicite', async () => {
  const pending = { key: 'original', body: { name: 'Mes courses' }, path: '/api/v1/shopping-lists' };
  const h = screen('components/lists/InstantListCreation.tsx', { pending, props: { onCreated() {} } });
  await h.ready();
  assert.equal(h.calls.filter(c => c[0] === 'command').length, 0);
  button(h, 'Reprendre la création').props.onPress(); await tick();
  assert.equal(h.calls.find(c => c[0] === 'command')[2], pending);
});


test('créer une liste propose Articles ou Produits avant toute écriture', async () => {
  const h = screen('app/CreateListScreen.tsx', { props: { route: { params: undefined } } }); await h.ready();
  assert.equal(h.calls.some(call => call[0] === 'command'), false);
  button(h, 'Liste de produits').props.onPress();
  assert.equal(h.render().props.kind, 'products');
});
