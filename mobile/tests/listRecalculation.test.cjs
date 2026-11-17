const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const flush = () => new Promise(setImmediate);
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function services() {
  const exports = {}, calls = [];
  vm.runInNewContext(ts.transpileModule(source('services/shoppingLists.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, require: name => name === 'expo-crypto' ? { randomUUID: () => 'same-key' } : { api: async (...args) => { calls.push(args); return { item: { fingerprint: 'prices', id: 'list' } }; } }, Date,
  });
  return { ...exports, calls };
}
test('recalcul : une commande authentifiée et idempotente avec la révision, sans prix client', async () => {
  const api = services();
  const command = api.recalculatePricesCommand({ id: 'list', revision: 4 });
  assert.equal(command.path, '/api/v1/shopping-lists/list/recalculate-prices');
  assert.deepEqual(JSON.parse(JSON.stringify(command.body)), { expected_revision: 4 });
  await api.sendListCommand(command, 'alice');
  assert.equal(api.calls[0][1].headers['Idempotency-Key'], 'same-key');
  assert.equal(api.calls[0][4], 'alice');
  await api.fetchPriceOptions('list', 'alice');
  assert.equal(api.calls[1][0], '/api/v1/shopping-lists/list/price-options');
  assert.equal(api.calls[1][1].method, undefined);
});
const quote = () => ({ fingerprint: 'prices', scenarios: [{ scenario: 'cheapest', needs: [{ item_ids: ['rice'], name: 'Riz' }] }],
  candidates: [
    { item_id: 'rice', product_id: 'maxi:1:rice', retailer: 'maxi', name: 'Riz 500 g', units: 1, amount: '3.00', format: '500 g', issue: null },
    { item_id: 'rice', product_id: 'metro:1:rice', retailer: 'metro', name: 'Autre riz', units: 1, amount: '4.00', format: '500 g', issue: null },
    { item_id: 'rice', product_id: 'superc:1:rice', retailer: 'superc', name: 'Riz inconnu', units: null, amount: null, format: null, issue: 'Prix inconnu' },
    { item_id: 'milk', product_id: 'milk', retailer: 'maxi', name: 'Lait', units: 1, amount: '2.00' },
  ] });
function panel({ respond, result = true } = {}) {
  const api = services(), hooks = [], effects = [], reads = [], commands = [];
  let list = { id: 'list', revision: 4 }, cursor = 0, closed = 0;
  const auth = { session: { user: { id: 'alice' } } }, exports = {}, jsx = (type, props) => ({ type, props: props ?? {} });
  vm.runInNewContext(ts.transpileModule(source('components/lists/ListProductAlternatives.tsx'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, Error, require(name) {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react') return {
      useState(initial) { const i = cursor++; hooks[i] ??= { value: initial }; return [hooks[i].value, value => { hooks[i].value = value; }]; },
      useRef(current) { const i = cursor++; return hooks[i] ??= { current }; },
      useCallback(fn, deps) { const i = cursor++; if (!hooks[i] || deps.some((v, n) => v !== hooks[i].deps[n])) hooks[i] = { fn, deps }; return hooks[i].fn; },
      useEffect(fn, deps) { const i = cursor++; if (!hooks[i] || deps.some((v, n) => v !== hooks[i].deps[n])) { const old = hooks[i]; hooks[i] = { deps }; effects.push(() => { old?.cleanup?.(); hooks[i].cleanup = fn(); }); } },
    };
    if (name === 'react-native') return { Text: 'Text', View: 'View', ActivityIndicator: 'Spinner' };
    if (name.endsWith('AuthContext')) return { useAuth: () => auth };
    if (name.endsWith('/recipes')) return { RecipeButton: 'Button', recipeStyles: {}, recipeColors: {} };
    if (name.endsWith('courseQuantities')) return { storeLabel: retailer => ({ maxi: 'Maxi', metro: 'Metro', superc: 'Super C' }[retailer]) };
    if (name.endsWith('shoppingLists')) return { ...api, fetchPriceOptions: async (...args) => { reads.push(args); return respond ? respond(...args) : quote(); } };
    throw new Error(name);
  } });
  const render = () => { cursor = 0; const tree = exports.default({ list, itemId: 'rice', disabled: false,
    onCommand: async command => { commands.push(command); return result; }, onClose: () => { closed++; } }); while (effects.length) effects.shift()(); return tree; };
  return { render, reads, commands, auth, closed: () => closed, async ready() { render(); await flush(); return render(); },
    changeRevision() { list = { ...list, revision: list.revision + 1 }; render(); }, unmount() { for (const hook of hooks) hook.cleanup?.(); } };
}
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
const button = (p, prefix) => nodes(p.render()).find(n => n.props.title?.startsWith(prefix));
test('les alternatives s’ouvrent directement, uniquement pour l’ingrédient concerné et sans comparaison supplémentaire', async () => {
  const p = panel(); await p.ready();
  assert.ok(button(p, 'Maxi · Riz')); assert.ok(button(p, 'Metro · Autre riz'));
  assert.equal(button(p, 'Maxi · Lait'), undefined);
  assert.equal(button(p, 'Comparer'), undefined);
  assert.equal(button(p, 'Recalculer'), undefined);
  assert.equal(p.commands.length, 0);
  for (let i = 0; i < 5; i++) p.render();
  assert.equal(p.reads.length, 1);
});
test('choisir un autre magasin recalcule le panier sans envoyer de montant ou modifier les achats côté client', async () => {
  const p = panel(); await p.ready(); button(p, 'Metro · Autre riz').props.onPress(); await flush();
  assert.deepEqual(JSON.parse(JSON.stringify(p.commands[0].body)), { expected_revision: 4, scenario: 'cheapest', choices: [{ item_id: 'rice', product_id: 'metro:1:rice' }] });
  assert.equal(p.closed(), 1);
});
test('un produit sans prix est désactivé et un enregistrement refusé garde les alternatives ouvertes', async () => {
  const p = panel({ result: false }); await p.ready();
  assert.equal(button(p, 'Super C · Riz inconnu').props.disabled, true);
  button(p, 'Metro · Autre riz').props.onPress(); await flush(); assert.equal(p.closed(), 0);
});
test('une ancienne réponse de prix est ignorée après une modification de la liste', async () => {
  const requests = [];
  const p = panel({ respond: () => new Promise(resolve => requests.push(resolve)) });
  p.render(); p.changeRevision(); requests[0](quote()); await flush();
  assert.equal(button(p, 'Maxi · Riz'), undefined);
  requests[1](quote()); await flush(); assert.ok(button(p, 'Maxi · Riz'));
});
test('une ancienne réponse de prix reste masquée après changement de compte', async () => {
  const requests = [];
  const p = panel({ respond: () => new Promise(resolve => requests.push(resolve)) });
  p.render(); p.auth.session = { user: { id: 'bob' } }; p.render(); requests[0](quote()); await flush();
  assert.equal(button(p, 'Maxi · Riz'), undefined);
  assert.deepEqual(p.reads.map(r => r[1]), ['alice', 'bob']);
});
test('échec réseau : réessayer explicitement, avec protection contre les doubles appuis', async () => {
  let calls = 0, finish;
  const p = panel({ respond: () => ++calls === 1 ? Promise.reject(new Error('Réseau indisponible')) : new Promise(resolve => { finish = resolve; }) });
  await p.ready(); const press = button(p, 'Réessayer').props.onPress;
  press(); press(); assert.equal(p.reads.length, 2);
  finish(quote()); await flush(); assert.ok(button(p, 'Maxi · Riz'));
});
