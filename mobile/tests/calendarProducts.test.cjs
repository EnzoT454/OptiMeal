const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const flush = () => new Promise(setImmediate);
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function loadHelper() {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source('services/shoppingCalendarProducts.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, Date, JSON });
  return exports;
}
const helpers = loadHelper();
const period = { start_date: '2026-11-16', end_date: '2026-11-22' };
const article = (id = 'calendar-rice', ingredient_id = 'rice') => ({ id, ingredient_id, name: ingredient_id, required: [{ amount: '300', unit: 'g' }], contributions: [], category: 'Épicerie', removed: false });
const need = (retailer, id = 'temporary-rice', ingredient_id = 'rice') => ({ item_ids: [id], ingredient_id, name: ingredient_id, amount: '3.00',
  lines: [{ amount: '3.00', sale_units: 1, sale: { product_id: `${retailer}:rice`, raw_source: { retailer } } }] });
function quote(partial = false) {
  return { fingerprint: partial ? 'partial-fingerprint' : 'full-fingerprint', scenarios: ['cheapest', 'maxi', 'metro', 'superc'].map(scenario => ({
    scenario, complete: !partial, known_amount: '3.00', store_count: 1,
    needs: [need(scenario === 'cheapest' ? 'maxi' : scenario), ...(partial ? [{ item_ids: ['temporary-milk'], ingredient_id: 'milk', name: 'milk', amount: null, lines: [] }] : [])],
  })) };
}
function harness(options = {}) {
  const hooks = [], effects = [], reads = [], commands = [], opened = [];
  let cursor = 0, sequence = 0, props = { period, onOpen: id => opened.push(id) };
  const auth = { session: { user: { id: 'alice' } } };
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source('components/EpicerieSemaine.tsx'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, Date, JSON, Map, Set, Error,
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (name === 'react') return {
        useState(initial) { const i = cursor++; hooks[i] ??= { value: typeof initial === 'function' ? initial() : initial }; return [hooks[i].value, value => { hooks[i].value = typeof value === 'function' ? value(hooks[i].value) : value; }]; },
        useRef(current) { const i = cursor++; return hooks[i] ??= { current }; },
        useEffect(fn, deps) { const i = cursor++; if (!hooks[i] || deps.some((v, n) => v !== hooks[i].deps[n])) { const old = hooks[i]; hooks[i] = { deps }; effects.push(() => { old?.cleanup?.(); hooks[i].cleanup = fn(); }); } },
      };
      if (name === 'react-native') return { ActivityIndicator: 'Spinner', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View', StyleSheet: { create: v => v } };
      if (name.includes('MaterialCommunityIcons')) return { __esModule: true, default: 'Icon' };
      if (name.endsWith('AuthContext')) return { useAuth: () => auth };
      if (name.endsWith('/recipes')) return { RecipeButton: 'Button', recipeColors: {} };
      if (name.endsWith('/promos')) return { storeName: v => v };
      if (name.endsWith('shoppingCalendarProducts')) return helpers;
      if (name.endsWith('useListCommand')) return { useListCommand: () => ({ ready: true, busy: false, locked: !!options.pending, pending: options.pending ?? null, error: options.error ?? '',
        run: async intent => { commands.push(intent); return options.send ? options.send(intent) : { id: 'created-list' }; } }) };
      if (name.endsWith('shoppingLists')) return {
        listsPath: '/api/v1/shopping-lists', localDate: () => '2026-11-19', quantityLabel: () => '300 g',
        listCommand: (path, body) => ({ path, body, method: 'POST', key: `key-${++sequence}` }),
        previewCalendar: async (body, user) => { reads.push(['calendar', body, user]); return options.preview ? options.preview(body, user) : {
          items: [article(), ...(options.partial ? [article('calendar-milk', 'milk')] : [])], excluded_meals: options.excludedMeals ?? [], purchase_date: body.purchase_date, preview_fingerprint: 'calendar-fingerprint' }; },
        previewCreationPrices: async (body, user) => { reads.push(['prices', body, user]); return options.prices ? options.prices(body, user) : quote(options.partial && body.items.length > 1); },
      };
      throw new Error(name);
    },
  });
  function render(next) { if (next) props = { ...props, ...next }; cursor = 0; const tree = exports.default(props); while (effects.length) effects.shift()(); return tree; }
  return { render, reads, commands, opened, auth, async ready() { render(); for (let i = 0; i < 3; i++) { await flush(); render(); } return render(); } };
}
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
const button = (h, title) => nodes(h.render()).find(n => n.props.title === title);
const scenarioButton = (h, name) => nodes(h.render()).find(n => n.props.accessibilityRole === 'radio' && JSON.stringify(n.props.children).includes(name));

test('noms de semaines : mois commun, changement de mois et d’année', () => {
  assert.equal(helpers.calendarProductsName(period), 'Épicerie 16-22 nov');
  assert.equal(helpers.calendarProductsName({ start_date: '2026-11-30', end_date: '2026-12-06' }), 'Épicerie 30 nov-6 déc');
  assert.equal(helpers.calendarProductsName({ start_date: '2026-12-28', end_date: '2027-01-03' }), 'Épicerie 28 déc 2026-3 janv 2027');
});
test('prix des lignes : rapprochement par ingrédient malgré les UUID temporaires différents', async () => {
  const h = harness(); await h.ready();
  const row = nodes(h.render()).find(n => typeof n.type === 'function' && n.props.article);
  assert.equal(row.props.article.id, 'calendar-rice'); assert.equal(row.props.besoin.item_ids[0], 'temporary-rice');
  assert.equal(row.props.besoin.amount, '3.00');
});
for (const [label, scenario] of [['Le moins cher', 'cheapest'], ['Maxi', 'maxi'], ['Metro', 'metro'], ['Super C', 'superc']]) {
  test(`création directe ${label} : période, nom, type et scénario puis ouverture de la ressource confirmée`, async () => {
    const h = harness(); await h.ready(); scenarioButton(h, label).props.onPress();
    button(h, 'Créer une liste de produits').props.onPress(); await flush();
    assert.equal(h.commands.length, 1); const intent = h.commands[0];
    assert.equal(intent.path, '/api/v1/shopping-lists/from-calendar');
    assert.equal(intent.body.kind, 'products'); assert.equal(intent.body.name, 'Épicerie 16-22 nov');
    assert.equal(intent.body.pricing.scenario, scenario); assert.equal(intent.body.pricing.fingerprint, 'full-fingerprint');
    assert.equal(intent.body.preview_fingerprint, 'calendar-fingerprint'); assert.equal(intent.body.activate, true);
    assert.deepEqual(h.opened, ['created-list']);
  });
}
test('besoins sans produit : confirmation annulable puis devis du sous-ensemble sans omission silencieuse', async () => {
  const h = harness({ partial: true }); await h.ready();
  button(h, 'Créer une liste de produits').props.onPress(); assert.equal(h.commands.length, 0);
  assert.match(JSON.stringify(h.render()), /milk/); button(h, 'Annuler').props.onPress();
  assert.equal(button(h, 'Créer avec les produits disponibles'), undefined);
  button(h, 'Créer une liste de produits').props.onPress(); button(h, 'Créer avec les produits disponibles').props.onPress(); await flush();
  assert.equal(h.commands.length, 1); assert.deepEqual(Array.from(h.commands[0].body.excluded_item_ids), ['calendar-milk']);
  assert.equal(h.commands[0].body.pricing.fingerprint, 'full-fingerprint');
  assert.equal(h.reads.filter(r => r[0] === 'prices')[1][1].items.length, 1);
});
test('si le nouveau devis change de produit, aucune création et une actualisation explicite', async () => {
  const h = harness({ partial: true, prices: async body => {
    const result = quote(body.items.length > 1);
    if (body.items.length === 1) result.scenarios.forEach(s => { s.needs[0].lines[0].sale.product_id = 'changed'; });
    return result;
  } }); await h.ready(); button(h, 'Créer une liste de produits').props.onPress(); button(h, 'Créer avec les produits disponibles').props.onPress(); await flush();
  assert.equal(h.commands.length, 0); assert.match(JSON.stringify(h.render()), /ont changé/);
});
test('double appui et réponse serveur refusée : pas de doublon ni navigation', async () => {
  let finish; const h = harness({ send: () => new Promise(resolve => { finish = resolve; }) }); await h.ready();
  const press = button(h, 'Créer une liste de produits').props.onPress; press(); press(); assert.equal(h.commands.length, 1);
  finish(null); await flush(); assert.equal(h.opened.length, 0);
});
test('reprise incertaine : renvoie exactement la commande persistée même après changement de scénario', async () => {
  const pending = { key: 'same-key', path: '/api/v1/shopping-lists/from-calendar', body: { name: 'original' }, method: 'POST' };
  const h = harness({ pending }); await h.ready(); button(h, 'Reprendre la création').props.onPress(); await flush();
  assert.equal(h.commands[0], pending); assert.deepEqual(h.opened, ['created-list']);
});
test('changement de compte pendant le devis partiel : aucune écriture tardive', async () => {
  let finish;
  const h = harness({ partial: true, prices: async body => body.items.length > 1 ? quote(true) : new Promise(resolve => { finish = resolve; }) });
  await h.ready(); button(h, 'Créer une liste de produits').props.onPress(); button(h, 'Créer avec les produits disponibles').props.onPress();
  h.auth.session = { user: { id: 'bob' } }; h.render(); finish(quote()); await flush();
  assert.equal(h.commands.length, 0); assert.equal(h.opened.length, 0);
});


test('scénario sans aucun produit chiffrable : création désactivée et actualisation proposée', async () => {
  const h = harness({ prices: async () => {
    const result = quote(); result.scenarios.forEach(s => { s.complete = false; s.needs[0].amount = null; s.needs[0].lines = []; }); return result;
  } }); await h.ready();
  assert.equal(button(h, 'Créer une liste de produits').props.disabled, true);
  assert.ok(button(h, 'Actualiser l’aperçu')); assert.equal(h.commands.length, 0);
});

test('repas inaccessibles : aucune création sans confirmation et acceptation explicite envoyée', async () => {
  const h = harness({ excludedMeals: [{ meal_id: 'unavailable' }] }); await h.ready();
  button(h, 'Créer une liste de produits').props.onPress(); assert.equal(h.commands.length, 0);
  button(h, 'Créer avec les produits disponibles').props.onPress(); await flush();
  assert.equal(h.commands[0].body.accept_partial, true);
});
