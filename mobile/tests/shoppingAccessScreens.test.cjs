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
        useCallback(fn, deps) { const i = index++; if (!slots[i] || deps.some((v, n) => v !== slots[i].deps[n])) slots[i] = { fn, deps }; return slots[i].fn; },
      };
      if (name === '@react-navigation/native') return {
        useNavigation: () => ({ navigate: (...args) => navigations.push(args) }),
        useFocusEffect(fn) { const i = index++; if (slots[i]?.fn !== fn) { const old = slots[i]; slots[i] = { fn }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } },
      };
      if (name === 'react-native') return { Text: 'Text', View: 'View', Pressable: 'Pressable', ActivityIndicator: 'Spinner' };
      if (name.endsWith('AuthContext')) return { useAuth: () => ({ session: user ? { user: { id: user } } : null }) };
      if (name.endsWith('useListCommand')) return { useListCommand: scope => ({ ready: true, busy: false, pending: options.pending ?? null, error: '', locked: false,
        run: async command => { calls.push(['command', scope, command]); return { list_id: 'selected' }; } }) };
      if (name.endsWith('ListDateField')) return { ListDateField: 'DateField' };
      if (name.endsWith('shoppingAccess')) return {
        loadPinnedList: async account => { calls.push(['pinned', account]); if (options.load) return options.load(account); return { cached: { snapshot: list, queue: [{ key: 'pending' }], syncedAt: '2026-11-16T12:00:00Z' }, offline: true }; },
        fetchPin: async () => { calls.push(['read-pin']); return { list_id: list.id }; }, pinPath: '/api/v1/shopping-list-pin',
      };
      if (name.endsWith('useShoppingPage')) return { useShoppingPage: (scope, fetch) => { calls.push(['scope', scope, fetch]); return { items: [list], total: 1, loading: false, error: '', load: async () => {} }; } };
      if (name.endsWith('/recipes')) return { RecipeButton: 'Button', recipeStyles: {}, recipeColors: {} };
      if (name.endsWith('/ui')) return { Message: 'Message' };
      if (name.endsWith('shoppingLists')) return { dateLabel: x => x, localDate: () => '2026-11-16', currentWeek: () => { throw new Error('Do not infer current week'); },
        previewCalendar: async body => { calls.push(['preview', body]); return null; },
        fetchLists: async (...args) => calls.push(['lists', ...args]),
        listCommand: (path, body, method) => ({ key: 'stable', path, body, method }) };
      if (name.endsWith('SavedListCard')) return { __esModule: true, default: 'SavedListCard' };
      throw new Error(name);
    },
  });
  const render = () => { index = 0; return exports.default(props); };
  return { render, calls, list, navigations, set user(value) { user = value; },
    async ready() { render(); effects.splice(0).forEach(fn => fn()); await tick(); return render(); } };
}
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
const text = tree => nodes(tree).flatMap(n => [].concat(n.props.children ?? [])).filter(n => typeof n === 'string').join(' ');
test('Accueil ouvre l’identifiant épinglé avec données anciennes et file visibles, sans montant recalculé', async () => {
  const opened = [], h = screen('components/lists/PinnedShoppingList.tsx', { props: { onOpen: id => opened.push(id), onLists() {} } });
  await h.ready(); const card = nodes(h.render()).find(n => n.type === 'SavedListCard');
  assert.equal(card.props.list.revision, 8); assert.match(text(h.render()), /Hors connexion/); assert.match(text(h.render()), /en attente/);
  card.props.onOpen(); assert.deepEqual(opened, ['selected']);
});
test('changement de compte masque la carte avant le chargement du nouveau compte', async () => {
  const h = screen('components/lists/PinnedShoppingList.tsx', { props: { onOpen() {}, onLists() {} } });
  await h.ready(); h.user = 'bob';
  assert.equal(nodes(h.render()).some(n => n.type === 'SavedListCard'), false);
});
test('réponse tardive d’un ancien compte n’écrase pas le nouvel accueil', async () => {
  let finish;
  const h = screen('components/lists/PinnedShoppingList.tsx', { load: account => account === 'alice' ? new Promise(resolve => { finish = resolve; }) : { cached: null, offline: false }, props: { onOpen() {}, onLists() {} } });
  await h.ready(); h.user = 'bob'; await h.ready(); finish({ cached: { snapshot: h.list, queue: [], syncedAt: '' }, offline: false }); await tick();
  assert.equal(nodes(h.render()).some(n => n.type === 'SavedListCard'), false);
});
test('Calendrier charge la période explicite, puis ouvre exactement la liste proposée', async () => {
  const opened = [], period = { start_date: '2027-01-04', end_date: '2027-01-10' };
  const h = screen('components/lists/CalendarLists.tsx', { props: { period, onCreate() {}, onOpen: id => opened.push(id) } });
  h.render(); const scope = h.calls.find(c => c[0] === 'scope');
  assert.equal(scope[1], 'calendar:2027-01-04:2027-01-10'); await scope[2](20);
  const call = h.calls.find(c => c[0] === 'lists'); assert.equal(call[1], 20); assert.equal(call[3], period); assert.equal(call[4], 'alice');
  nodes(h.render()).find(n => n.type === 'SavedListCard').props.onOpen(); assert.deepEqual(opened, ['selected']);
});
test('résumé commun : afficher les décimaux serveur et le sous-total incomplet sans prix inventé', () => {
  // Load totals through the same source, selecting its named export below.
  const source = fs.readFileSync(path.join(__dirname, '../components/lists/SavedListCard.tsx'), 'utf8');
  const exports = {}, jsx = (type, props) => ({ type, props });
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: name => name === 'react/jsx-runtime' ? { jsx, jsxs: jsx } : name === 'react-native' ? { Text: 'Text', Pressable: 'Pressable' } : name.endsWith('/recipes') ? { recipeStyles: {} } : { dateLabel: x => x } });
  const h = screen('components/lists/CalendarLists.tsx', { props: { period: { start_date: '', end_date: '' } } });
  const rendered = text(exports.SavedListTotals({ list: h.list }));
  assert.match(rendered, /Sous-total connu/); assert.match(rendered, /19,90/); assert.match(rendered, /9,95/);
});

test('épinglage : état cible explicite, commande privée et relecture après réponse', async () => {
  const h = screen('components/lists/PinListAction.tsx', { props: { id: 'selected', disabled: false } });
  await h.ready();
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
test('création depuis Calendrier : préremplir la période demandée et l’envoyer à l’aperçu', async () => {
  const period = { start_date: '2027-01-04', end_date: '2027-01-10' };
  const h = screen('app/CreateListScreen.tsx', { props: { route: { params: { period } }, navigation: {} } });
  h.render(); const fields = nodes(h.render()).filter(n => n.type === 'DateField');
  assert.equal(fields.find(n => n.props.label === 'Premier jour inclus').props.value, period.start_date);
  assert.equal(fields.find(n => n.props.label === 'Dernier jour inclus').props.value, period.end_date);
  nodes(h.render()).find(n => n.props.title === 'Voir l’aperçu').props.onPress(); await tick();
  assert.equal(h.calls.find(c => c[0] === 'preview')[1].start_date, period.start_date);
});
