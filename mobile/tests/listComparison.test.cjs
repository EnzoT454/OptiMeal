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
  vm.runInNewContext(ts.transpileModule(source('services/shoppingLists.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, require: name => name === 'expo-crypto' ? { randomUUID: () => 'new-key' }
    : { api: async (...args) => { calls.push(args); return { item: { id: 'comparison' } }; } }, Date });
  return { ...exports, calls };
}
test('comparer est une lecture authentifiée ; appliquer porte uniquement identité, scénario et révision', async () => {
  const api = services();
  assert.equal((await api.compareList('list', 'alice')).id, 'comparison');
  assert.equal(api.calls[0][0], '/api/v1/shopping-lists/list/comparisons');
  assert.equal(api.calls[0][4], 'alice');
  assert.equal(api.calls[0][1].method, 'POST');
  assert.equal(api.calls[0][1].headers, undefined);
  const comparison = { list_id: 'list', id: 'comparison', source_revision: 8 };
  const command = api.applyComparisonCommand(comparison, 'metro', true);
  assert.equal(JSON.stringify(command.body), JSON.stringify({ expected_revision: 8,
    comparison_id: 'comparison', scenario: 'metro', accept_partial: true }));
  assert.equal(command.path, '/api/v1/shopping-lists/list/apply-comparison');
});

function panel({ partial = false, respond } = {}) {
  const api = services();
  let list = { id: 'list', revision: 4, choices: [] }, cursor = 0;
  const hooks = [], effects = [], calls = [], commands = [], alerts = [];
  const auth = { session: { user: { id: 'alice' } } };
  const comparison = { id: 'comparison', list_id: 'list', source_revision: 4, candidates: [],
    scenarios: ['maxi', 'metro', 'superc', 'cheapest'].map(scenario => ({ scenario,
      needs: [{ item_ids: ['rice'], name: 'Riz', ingredient_id: 'ing_riz', status: partial ? 'unpriced' : 'complete', lines: [], warnings: [] }],
      known_amount: '6.00', complete: !partial, store_totals: [], store_count: 1 })) };
  const exports = {}, jsx = (type, props) => ({ type, props: props ?? {} });
  vm.runInNewContext(ts.transpileModule(source('components/lists/ListComparison.tsx'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require(name) {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react') return {
      useState(initial) { const i = cursor++; hooks[i] ??= { value: initial }; return [hooks[i].value, v => { hooks[i].value = v; }]; },
      useRef(initial) { const i = cursor++; return hooks[i] ??= { current: initial }; },
      useEffect(fn, deps) { const i = cursor++; if (!hooks[i] || deps.some((v, n) => v !== hooks[i].deps[n])) {
        effects.push(() => { hooks[i]?.cleanup?.(); hooks[i] = { deps, cleanup: fn() }; });
      } },
    };
    if (name === 'react-native') return { Text: 'Text', View: 'View', ActivityIndicator: 'ActivityIndicator', Alert: { alert: (...args) => alerts.push(args) } };
    if (name.endsWith('AuthContext')) return { useAuth: () => auth };
    if (name.endsWith('recipes')) return { RecipeButton: 'RecipeButton', recipeStyles: {} };
    if (name.endsWith('shoppingLists')) return { ...api, compareList: async (...args) => {
      calls.push(args); return respond ? respond() : comparison;
    } };
    throw new Error(name);
  }, Error });
  const onCommand = async intent => { commands.push(intent); return true; };
  function render() {
    cursor = 0; const tree = exports.default({ list, disabled: false, onCommand });
    while (effects.length) effects.shift()();
    return tree;
  }
  render();
  return { render, calls, commands, alerts, comparison, auth,
    changeRevision() { list = { ...list, revision: list.revision + 1 }; render(); },
    unmount() { for (const hook of hooks) hook.cleanup?.(); } };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props.children)];
}
const button = (p, title) => nodes(p.render()).find(node => node.props.title === title);
async function compare(p) { await button(p, 'Comparer les achats').props.onPress(); await flush(); }

test('changer les quatre segments ne produit aucune commande ; seule appliquer écrit', async () => {
  const p = panel(); await compare(p);
  for (const label of ['Maxi', 'Metro', 'Super C', 'Moins cher']) {
    const node = nodes(p.render()).find(n => n.props.title?.startsWith(label));
    node.props.onPress();
  }
  assert.equal(p.commands.length, 0);
  button(p, 'Appliquer cette proposition').props.onPress(); await flush();
  assert.equal(p.commands.length, 1);
  assert.equal(p.commands[0].body.scenario, 'cheapest');
  assert.equal(p.commands[0].body.expected_revision, 4);
});
test('proposition partielle : annuler ne modifie rien ; accepter transmet le consentement', async () => {
  const p = panel({ partial: true }); await compare(p);
  button(p, 'Appliquer cette proposition').props.onPress();
  assert.equal(p.commands.length, 0);
  const actions = p.alerts[0][2];
  assert.equal(actions[0].style, 'cancel');
  actions[1].onPress(); await flush();
  assert.equal(p.commands[0].body.accept_partial, true);
});
test('une réponse tardive après révision ne réaffiche pas une proposition obsolète', async () => {
  let finish; const p = panel({ respond: () => new Promise(resolve => { finish = resolve; }) });
  button(p, 'Comparer les achats').props.onPress();
  p.changeRevision(); finish(p.comparison); await flush();
  assert.equal(button(p, 'Appliquer cette proposition'), undefined);
});
test('une réponse tardive après changement de compte reste masquée', async () => {
  let finish; const p = panel({ respond: () => new Promise(resolve => { finish = resolve; }) });
  button(p, 'Comparer les achats').props.onPress();
  p.auth.session = { user: { id: 'bob' } }; p.render();
  finish(p.comparison); await flush();
  assert.equal(button(p, 'Appliquer cette proposition'), undefined);
});
test('un échec de comparaison garde un message et ne crée aucune répartition', async () => {
  const p = panel({ respond: async () => { throw new Error('Réseau indisponible'); } });
  await compare(p);
  assert.equal(p.commands.length, 0);
  assert.ok(nodes(p.render()).some(n => n.props.children === 'Réseau indisponible'));
});

test('deux appuis sur comparer ne lancent qu’une lecture', async () => {
  let finish; const p = panel({ respond: () => new Promise(resolve => { finish = resolve; }) });
  const press = button(p, 'Comparer les achats').props.onPress;
  press(); press(); assert.equal(p.calls.length, 1);
  finish(p.comparison); await flush();
});
test('une comparaison sur une révision plus récente exige de relire la liste', async () => {
  const p = panel({ respond: async () => ({ ...p.comparison, source_revision: 5 }) });
  await compare(p);
  assert.equal(button(p, 'Appliquer cette proposition'), undefined);
  assert.ok(nodes(p.render()).some(n => String(n.props.children).includes('Actualise la liste')));
});
