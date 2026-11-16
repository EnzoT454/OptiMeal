const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const tick = () => new Promise(resolve => setImmediate(resolve));
function screen(options = {}) {
  const slots = [], effects = [], calls = [], navigations = [];
  let cursor = 0, user = options.user === undefined ? 'alice' : options.user;
  const ledger = { version: 1, receipts: {}, run: options.run ?? null, lastListId: null };
  const preview = { signature: 'source', items: [{ token: 'item', name: 'Riz', ingredientId: 'ing_rice' }],
    exclusions: [{ token: 'pantry', name: 'Riz', ingredientId: 'ing_rice' }], warnings: [], recoveredCount: 0 };
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../app/ShoppingRecoveryScreen.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, Error, require(name) {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react') return {
      useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
        return [slots[i].value, value => { slots[i].value = value; }]; },
      useRef(current) { const i = cursor++; return slots[i] ??= { current }; },
      useCallback(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((v, n) => v !== slots[i].deps[n])) slots[i] = { fn, deps }; return slots[i].fn; },
    };
    if (name === '@react-navigation/native') return { useFocusEffect(fn) { const i = cursor++; if (slots[i]?.fn !== fn) {
      const old = slots[i]; slots[i] = { fn }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); });
    } } };
    if (name === 'react-native') return { Text: 'Text', View: 'View', Pressable: 'Pressable', ActivityIndicator: 'Spinner' };
    if (name.endsWith('AuthContext')) return { useAuth: () => ({ session: user ? { user: { id: user } } : null, requestSignIn: (...args) => calls.push(['signin', ...args]) }) };
    if (name.endsWith('/recipes')) return { RecipeButton: 'Button', RecipeField: 'Field', RecipeScreen: 'Screen', RecipeTitle: 'Title', recipeStyles: {}, recipeColors: {} };
    if (name.endsWith('/ui')) return { Message: 'Message' };
    if (name.endsWith('ListDateField')) return { ListDateField: 'Date' };
    if (name.endsWith('shoppingLists')) return { localDate: () => '2026-11-16' };
    if (name.endsWith('shoppingRecovery')) return {
      async readRecovery(account) { calls.push(['read', account]); return ledger; },
      async previewRecovery(account) { calls.push(['preview', account]); return preview; },
      async beginRecovery(...args) { calls.push(['begin', ...args]); ledger.run = { name: 'Récupérés', items: preview.items, exclusions: [], itemIndex: 0, exclusionIndex: 0, pending: null, listId: null }; return ledger; },
      async resumeRecovery(account, current) { calls.push(['resume', account]); if (options.resume) return options.resume(account, current);
        return { ...ledger, run: null, lastListId: 'list' }; },
      async skipRejectedRecoveryItem(account) { calls.push(['skip', account]); return ledger; },
    };
    throw new Error(name);
  } });
  function render() { cursor = 0; return exports.default({ navigation: {
    replace: (...args) => navigations.push(args), navigate: (...args) => navigations.push(args),
  } }); }
  return { render, calls, navigations, preview, ledger,
    set user(value) { user = value; },
    async ready() { render(); effects.splice(0).forEach(fn => fn()); await tick(); return render(); } };
}
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
const button = (view, title) => nodes(view.render()).find(node => node.props.title === title);
const checkbox = (view, label) => nodes(view.render()).find(node => node.props.accessibilityRole === 'checkbox' && node.props.accessibilityLabel === label);
test('aperçu : rien envoyé avant confirmation et exclusions non sélectionnées par défaut', async () => {
  const h = screen(); await h.ready();
  assert.equal(checkbox(h, 'Riz').props.accessibilityState.checked, true);
  assert.equal(checkbox(h, 'Ne plus suggérer Riz').props.accessibilityState.checked, false);
  assert.equal(h.calls.some(call => call[0] === 'begin'), false);
  await button(h, 'Confirmer la récupération').props.onPress(); await tick();
  const begin = h.calls.find(call => call[0] === 'begin');
  assert.deepEqual(Array.from(begin[3]), ['item']); assert.deepEqual(Array.from(begin[4]), []);
  assert.deepEqual(JSON.parse(JSON.stringify(h.navigations)), [['ShoppingDetail', { id: 'list' }]]);
});
test('désélection et choix facultatif de préférence modifient le consentement envoyé', async () => {
  const h = screen(); await h.ready(); checkbox(h, 'Riz').props.onPress();
  assert.equal(button(h, 'Confirmer la récupération').props.disabled, true);
  checkbox(h, 'Ne plus suggérer Riz').props.onPress();
  assert.equal(button(h, 'Confirmer la récupération').props.disabled, false);
  button(h, 'Confirmer la récupération').props.onPress(); await tick();
  const begin = h.calls.find(call => call[0] === 'begin'); assert.deepEqual(Array.from(begin[3]), []); assert.deepEqual(Array.from(begin[4]), ['pantry']);
});
test('journal restauré : proposer la reprise sans nouvelle confirmation ou nouvel aperçu', async () => {
  const h = screen({ run: { name: 'Courses', items: [], exclusions: [], itemIndex: 0, exclusionIndex: 0, listId: 'list', pending: { kind: 'item', command: {} } } });
  await h.ready(); assert.ok(button(h, 'Reprendre la récupération'));
  assert.equal(button(h, 'Ignorer cet élément refusé et continuer'), undefined);
  assert.equal(h.calls.some(call => call[0] === 'preview'), false);
  button(h, 'Reprendre la récupération').props.onPress(); await tick();
  assert.equal(h.calls.some(call => call[0] === 'begin'), false);
});
test('visiteur : aucune lecture privée et connexion à la demande', async () => {
  const h = screen({ user: null }); await h.ready(); assert.equal(h.calls.length, 0);
  button(h, 'Me connecter').props.onPress(); assert.equal(h.calls[0][0], 'signin');
});
test('réponse tardive après changement de compte : aucune navigation vers la liste précédente', async () => {
  let finish;
  const h = screen({ resume: () => new Promise(resolve => { finish = resolve; }) }); await h.ready();
  button(h, 'Confirmer la récupération').props.onPress(); await tick();
  h.user = 'bob';
  assert.equal(nodes(h.render()).some(n => n.props.accessibilityLabel === 'Riz'), false);
  await h.ready(); finish({ run: null, lastListId: 'alice-list' }); await tick();
  assert.equal(h.navigations.length, 0);
});
