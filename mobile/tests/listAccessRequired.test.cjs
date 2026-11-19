const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const tick = () => new Promise(resolve => setImmediate(resolve));
function gate(options = {}) {
  const slots = [], effects = [], calls = [], timers = new Set(), listeners = new Set();
  let cursor = 0, user = options.user === undefined ? 'alice' : options.user, online = options.online !== false;
  const exports = {}, jsx = (type, props) => ({ type, props: props ?? {} });
  let focusCleanup;
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../components/lists/ListAccessRequired.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, Error,
    setInterval(fn) { timers.add(fn); return fn; }, clearInterval(fn) { timers.delete(fn); },
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'react') return {
        useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: initial }; return [slots[i].value, value => { slots[i].value = value; }]; },
        useRef(current) { const i = cursor++; return slots[i] ??= { current }; },
        useCallback(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((v, n) => v !== slots[i].deps[n])) slots[i] = { fn, deps }; return slots[i].fn; },
      };
      if (name === '@react-navigation/native') return { useFocusEffect(fn) { const i = cursor++; if (slots[i]?.fn !== fn) {
        const old = slots[i]; slots[i] = { fn }; effects.push(() => { old?.cleanup?.(); focusCleanup = slots[i].cleanup = fn(); });
      } } };
      if (name === 'react-native') return { Text: 'Text', ActivityIndicator: 'Spinner', AppState: { addEventListener(event, fn) { listeners.add(fn); return { remove: () => listeners.delete(fn) }; } } };
      if (name.endsWith('AuthContext')) return { useAuth: () => ({ session: user ? { user: { id: user } } : null }) };
      if (name.endsWith('/api')) return { api: async (...args) => {
        calls.push(args); if (options.api) return options.api(...args); if (!online) throw new Error('offline'); return { items: [], total: 0 };
      } };
      if (name.endsWith('AccountRequired')) return { AccountRequired: 'AccountRequired' };
      if (name.endsWith('/recipes')) return { RecipeScreen: 'Screen', RecipeTitle: 'Title', RecipeButton: 'Button', recipeStyles: {}, recipeColors: {} };
      throw new Error(name);
    },
  });
  const render = () => { cursor = 0; return exports.default({ children: 'PRIVATE_NAVIGATOR' }); };
  return { render, calls, timers, listeners, set user(value) { user = value; }, set online(value) { online = value; },
    async ready() { render(); effects.splice(0).forEach(fn => fn()); await tick(); return render(); },
    blur() { focusCleanup?.(); }, async foreground() { for (const fn of listeners) fn('active'); await tick(); } };
}
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
const containsPrivate = tree => nodes(tree).some(node => node.props.children === 'PRIVATE_NAVIGATOR');
test('visiteur : écran de connexion, aucune lecture privée et aucun navigateur personnel monté', async () => {
  const h = gate({ user: null }); const tree = await h.ready();
  assert.equal(tree.type, 'AccountRequired'); assert.equal(h.calls.length, 0); assert.equal(containsPrivate(tree), false);
});
test('avant vérification réseau : ne pas monter le navigateur ni afficher un cache', async () => {
  let finish;
  const h = gate({ api: () => new Promise(resolve => { finish = resolve; }) });
  const pending = await h.ready(); assert.equal(containsPrivate(pending), false);
  finish({ items: [], total: 0 }); await tick(); assert.equal(containsPrivate(h.render()), true);
  assert.equal(h.calls[0][4], 'alice'); assert.equal(h.calls[0][3], 5000);
});
test('sans réseau : accès bloqué et reprise explicite après reconnexion', async () => {
  const h = gate({ online: false }); await h.ready(); assert.equal(containsPrivate(h.render()), false);
  const button = nodes(h.render()).find(n => n.props.title === 'Réessayer'); assert.ok(button);
  h.online = true; button.props.onPress(); await tick(); assert.equal(containsPrivate(h.render()), true);
});
test('aucun contrôle périodique ni au retour au premier plan après la vérification d’entrée', async () => {
  const h = gate(); await h.ready(); assert.equal(containsPrivate(h.render()), true);
  assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
  h.online = false; await h.foreground();
  assert.equal(h.calls.length, 1);
  h.blur(); assert.equal(h.timers.size, 0);
});
test('changement de compte : ignorer une validation réseau tardive de l’ancien compte', async () => {
  let finish;
  const h = gate({ api: (...args) => args[4] === 'alice' ? new Promise(resolve => { finish = resolve; }) : Promise.reject(new Error('offline')) });
  await h.ready(); h.user = 'bob'; assert.equal(containsPrivate(h.render()), false); await h.ready();
  finish({ items: [], total: 0 }); await tick(); assert.equal(containsPrivate(h.render()), false);
});
