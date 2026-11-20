const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const flush = () => new Promise(setImmediate);
const json = value => JSON.parse(JSON.stringify(value));
function harness(file, options = {}) {
  const slots = [], effects = [], timers = new Map(), calls = [], commands = [], alerts = [], navigations = [];
  const auth = { session: { user: { id: 'alice' } } };
  let index = 0, sequence = 0, timerId = 0;
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const effect = (fn, deps) => {
    const n = index++;
    if (!slots[n] || deps.some((v, i) => v !== slots[n].deps[i])) {
      const old = slots[n]; slots[n] = { deps };
      effects.push(() => { old?.cleanup?.(); slots[n].cleanup = fn(); });
    }
  };
  const react = {
    useState(initial) { const n = index++; slots[n] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[n].value, v => { slots[n].value = typeof v === 'function' ? v(slots[n].value) : v; }]; },
    useRef(current) { const n = index++; return slots[n] ??= { current }; },
    useEffect: effect,
    useCallback(fn, deps) { const n = index++; if (!slots[n] || deps.some((v, i) => v !== slots[n].deps[i])) slots[n] = { deps, fn }; return slots[n].fn; },
  };
  const ingredient = { id: 'ing_lait', name: 'Lait', aliases: [], category: 'Produits laitiers' };
  const offer = { id: 'releve-ephemere', product_id: 'maxi:1:lait', ingredient_id: ingredient.id, product_name: 'Lait 2 %', retailer: 'maxi',
    format: { quantity: '1000', unit_raw: 'ml' }, image_url: null, price: { amount: '3.00' }, promo_price: null, promotion: { status: 'not_promotion' } };
  const resource = options.list ?? { kind: options.kind ?? 'articles', id: 'list', name: 'Mes courses', revision: 2, purchase_date: '2026-11-19', status: 'active', items: [], choices: [], purchases: [], product_purchases: [], assignment: null,
    totals: { remaining_item_count: 0, purchased_item_count: 0, budget_known_amount: '0', remaining_known_amount: '0', estimate_complete: false, unpriced_item_count: 1 } };
  const quote = options.quote ?? { fingerprint: 'f'.repeat(64), scenarios: ['cheapest', 'maxi', 'metro', 'superc'].map(scenario => ({ scenario, complete: false, known_amount: '3.00', needs: [{ item_ids: ['milk'], name: 'Lait', status: 'unpriced', lines: [] }] })) };
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, AbortController, Error, Date, Promise, setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); },
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'react') return react;
      if (name === 'expo-crypto') return { randomUUID: () => `item-${++sequence}` };
      if (name.endsWith('shoppingReuse')) return { templatesPath: '/api/v1/shopping-list-templates' };
      if (name === '@react-navigation/native') return { useFocusEffect: fn => effect(fn, [fn]) };
      if (name === 'react-native') return { TextInput: 'Input', Text: 'Text', View: 'View', Pressable: 'Pressable', ActivityIndicator: 'Spinner',
        Keyboard: { dismiss: () => calls.push(['dismiss']) }, BackHandler: { addEventListener: (_, fn) => { calls.push(['back', fn]); return { remove() {} }; } },
        Alert: { alert: (...args) => alerts.push(args) } };
      if (name.endsWith('AuthContext')) return { useAuth: () => auth };
      if (name.endsWith('/recipes')) return { RecipeButton: 'Button', RecipeField: 'Field', RecipeScreen: 'Screen', RecipeTitle: 'Title', recipeStyles: {}, recipeColors: {} };
      if (name.endsWith('ProductImage')) return { ProductImage: 'Photo' };
      if (name.endsWith('offerPricing')) return { currentOfferPrice: o => o.price.amount, quantityPriceCondition: () => null };
      if (name.endsWith('shoppingPresentation')) return require('./helpers/loadShoppingPresentation.cjs')();
      if (name.endsWith('courseQuantities')) return { storeLabel: r => r, manualCheckCoverage: item => item.required.length ? { quantities: item.required } : { confirms_unquantified: true } };
      if (name.endsWith('shoppingRecents')) return {
        readShoppingRecents: async account => { calls.push(['recents', account]); return options.recents ?? []; },
        rememberShoppingArticle: async (account, item) => { calls.push(['remember', account, item]); return [item]; },
      };
      if (name.endsWith('/api')) return { api: (...args) => { calls.push(['api', ...args]); return options.api ? options.api(...args)
        : Promise.resolve({ items: args[0].includes('/ingredients') ? [ingredient] : [offer], total: 1 }); } };
      if (name.endsWith('useListCommand')) return { useListCommand: () => ({ ready: true, locked: false, busy: false, pending: options.pending ?? null, error: '',
        run: async command => { commands.push(command); return options.send ? options.send(command) : resource; } }) };
      if (name.endsWith('shoppingLists')) return {
        listsPath: '/api/v1/shopping-lists', localDate: () => '2026-11-19', dateLabel: v => v, quantityLabel: values => values.map(q => `${q.amount} ${q.unit}`).join(' + '),
        listCommand: (path, body, method = 'POST') => ({ key: `key-${++sequence}`, path, body, method }),
        recalculatePricesCommand: (list, body) => ({ key: `key-${++sequence}`, path: `/api/v1/shopping-lists/${list.id}/recalculate-prices`, method: 'POST', body: { expected_revision: list.revision, ...body } }),
        fetchList: async () => resource, fetchPriceOptions: async () => quote,
      };
      throw new Error(name);
    },
  });
  let props = { list: resource, disabled: false, onOpen() {}, onCommand: async command => { commands.push(command); return options.send ? options.send(command) : true; },
    route: { params: { id: 'list' } }, navigation: { goBack: () => navigations.push('back') }, ...options.props };
  const render = () => { index = 0; const tree = exports.default(props); while (effects.length) effects.shift()(); return tree; };
  return { render, auth, resource, ingredient, offer, calls, commands, alerts, navigations,
    async timers() { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } await flush(); return render(); },
    async ready() { render(); await flush(); return render(); },
    props(changes) { props = { ...props, ...changes }; },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
const button = (h, title) => nodes(h.render()).find(n => n.props.title === title);
const input = h => nodes(h.render()).find(n => n.type === 'Input');
const label = (h, text) => nodes(h.render()).find(n => n.props.accessibilityLabel === text);
async function search(h, query = 'lait') { await h.ready(); input(h).props.onFocus(); input(h).props.onChangeText(query); h.render(); await h.timers(); }

test('recherche inline : frappe différée, pagination bornée et annulation des requêtes dépassées', async () => {
  const h = harness('components/lists/ListQuickAdd.tsx', { kind: 'products' }); await h.ready();
  input(h).props.onFocus(); input(h).props.onChangeText('l'); h.render();
  input(h).props.onChangeText('la'); h.render(); input(h).props.onChangeText('lai'); h.render();
  assert.equal(h.calls.filter(c => c[0] === 'api').length, 0);
  await h.timers();
  const reads = h.calls.filter(c => c[0] === 'api');
  assert.equal(reads.length, 1); assert.ok(reads[0][1].includes('/offers')); assert.ok(reads.every(c => c[1].includes('q=lai') && c[1].includes('limit=3')));
  input(h).props.onChangeText('pain'); h.render();
  assert.equal(reads[0][2].signal.aborted, true);
  h.calls.find(c => c[0] === 'back')[1]();
  assert.ok(h.calls.some(c => c[0] === 'dismiss'));
  assert.equal(h.commands.length, 0);
});

test('ajout générique immédiat : pas de produit ni de prix, double tap neutralisé', async () => {
  let finish;
  const h = harness('components/lists/ListQuickAdd.tsx', { send: () => new Promise(resolve => { finish = resolve; }) });
  await search(h);
  const choose = label(h, 'Ajouter l’article Lait, sans choisir de produit').props.onPress;
  choose(); choose(); assert.equal(h.commands.length, 1);
  assert.deepEqual(json(h.commands[0].body), { expected_revision: 2, name: 'Lait', ingredient_id: 'ing_lait', merge: 'separate' });
  assert.equal(input(h).props.value, 'lait'); finish(true); await flush();
  assert.equal(input(h).props.value, '');
  assert.ok(h.calls.some(c => c[0] === 'remember' && c[1] === 'alice'));
});

test('article libre inconnu et erreur : pas d’identité inventée, saisie préservée', async () => {
  const h = harness('components/lists/ListQuickAdd.tsx', { send: async () => false }); await search(h, 'inconnu');
  input(h).props.onSubmitEditing(); await flush();
  assert.equal(h.commands[0].body.ingredient_id, null); assert.equal(h.commands[0].body.product_id, undefined);
  assert.equal(input(h).props.value, 'inconnu');
});

test('produit explicite : identité stable et ajout atomique, aucun montant client', async () => {
  const h = harness('components/lists/ListQuickAdd.tsx', { kind: 'products' }); await search(h);
  label(h, 'Ajouter le produit Lait 2 %, maxi').props.onPress(); await flush();
  assert.equal(h.commands[0].body.product_id, 'maxi:1:lait');
  assert.equal(h.commands[0].body.ingredient_id, 'ing_lait');
  assert.equal(h.commands[0].body.amount, undefined); assert.notEqual(h.commands[0].body.product_id, h.offer.id);
  assert.ok(nodes(h.render()).some(n => n.props.accessibilityLiveRegion === 'polite'));
  button(h, 'Terminé').props.onPress();
  assert.equal(nodes(h.render()).some(n => n.props.accessibilityLiveRegion === 'polite'), false);
});

test('doublon volontaire : la fusion attend une décision, garder séparé reste disponible', async () => {
  const h = harness('components/lists/ListQuickAdd.tsx'); h.resource.items = [{ id: 'milk', ingredient_id: 'ing_lait', name: 'Lait', removed: false }];
  await search(h); label(h, 'Ajouter l’article Lait, sans choisir de produit').props.onPress();
  assert.equal(h.commands.length, 0); assert.equal(h.alerts[0][2][0].text, 'Annuler');
  h.alerts[0][2][2].onPress(); await flush(); assert.equal(h.commands[0].body.merge, 'separate');
});

test('changement de compte : réponse tardive et récents du compte précédent masqués', async () => {
  const waits = [];
  const h = harness('components/lists/ListQuickAdd.tsx', { api: () => new Promise(resolve => waits.push(resolve)), recents: [{ name: 'Privé A', ingredient_id: null }] });
  await search(h); h.auth.session = { user: { id: 'bob' } }; h.render(); await flush();
  waits.forEach(resolve => resolve({ items: [{ id: 'private', name: 'Privé A', aliases: [] }], total: 1 })); await flush();
  assert.equal(label(h, 'Ajouter l’article Privé A, sans choisir de produit'), undefined);
  assert.ok(h.calls.some(c => c[0] === 'recents' && c[1] === 'bob'));
});

test('coche générique : retour immédiat puis retour à l’état confirmé après échec', async () => {
  let finish;
  const item = { id: 'milk', name: 'Lait', required: [], coverage_status: 'remaining' };
  const h = harness('components/lists/ShoppingListItemRow.tsx', { props: { item }, send: () => new Promise(resolve => { finish = resolve; }) });
  await h.ready(); label(h, 'Acheté sans prix : Lait').props.onPress();
  assert.equal(label(h, 'Acheté sans prix : Lait').props.accessibilityState.checked, true);
  assert.equal(h.commands[0].body.coverage.confirms_unquantified, true);
  finish(false); await flush();
  assert.equal(label(h, 'Acheté sans prix : Lait').props.accessibilityState.checked, false);
});

test('comparateur : lecture et retour sans application ne mutent jamais la liste', async () => {
  const h = harness('app/ShoppingComparisonScreen.tsx'); await h.ready();
  assert.equal(h.commands.length, 0);
  button(h, 'Retour à ma liste').props.onPress();
  assert.deepEqual(h.navigations, ['back']); assert.equal(h.commands.length, 0);
});

test('comparateur partiel : confirmation, révision et empreinte, aucun prix envoyé', async () => {
  const h = harness('app/ShoppingComparisonScreen.tsx'); await h.ready();
  button(h, 'Appliquer cette proposition').props.onPress(); assert.equal(h.commands.length, 0);
  assert.match(h.alerts[0][1], /sous-total/); h.alerts[0][2][1].onPress(); await flush();
  assert.deepEqual(json(h.commands[0].body), { expected_revision: 2, scenario: 'cheapest', expected_fingerprint: 'f'.repeat(64), accept_partial: true });
  assert.deepEqual(h.navigations, ['back']);
});


test('sans sélection, Entrée ajoute le texte libre même si un ingrédient correspond', async () => {
  const h = harness('components/lists/ListQuickAdd.tsx'); await search(h);
  const tree = h.render();
  assert.equal(nodes(tree).some(n => n.props.title?.includes('comme article libre')), false);
  assert.equal(nodes(tree).some(n => /Choisir ce produit|sans produit :/.test(n.props.title ?? '')), false);
  input(h).props.onSubmitEditing(); await flush();
  assert.equal(h.commands.length, 1);
  assert.equal(h.commands[0].body.name, 'lait');
  assert.equal(h.commands[0].body.ingredient_id, null);
  assert.equal(h.commands[0].body.product_id, undefined);
  assert.equal(input(h).props.value, '');
});

test('Terminé valide une seule fois puis ferme les suggestions sans message résiduel', async () => {
  let finish;
  const h = harness('components/lists/ListQuickAdd.tsx', { send: () => new Promise(resolve => { finish = resolve; }) });
  await search(h, 'Serviettes');
  button(h, 'Terminé').props.onPress(); input(h).props.onSubmitEditing();
  assert.equal(h.commands.length, 1);
  assert.equal(h.commands[0].body.name, 'Serviettes');
  assert.equal(h.commands[0].body.ingredient_id, null);
  finish(true); await flush();
  assert.equal(nodes(h.render()).some(n => n.props.accessibilityLiveRegion === 'polite'), false);
  assert.equal(h.commands.length, 1);
  assert.ok(h.calls.some(c => c[0] === 'dismiss'));
  assert.equal(button(h, 'Terminé'), undefined);
});


test('liste produits : aucun ingrédient ni ajout libre ; Terminé ferme sans créer de besoin', async () => {
  const editing = [];
  const h = harness('components/lists/ListQuickAdd.tsx', { kind: 'products', props: { onEditingChange: value => editing.push(value) } });
  await search(h, 'introuvable');
  assert.equal(label(h, 'Ajouter l’article Lait, sans choisir de produit'), undefined);
  input(h).props.onSubmitEditing(); await flush(); h.render();
  assert.equal(h.commands.length, 0);
  assert.equal(editing.at(-1), false);
});

test('liste articles : aucune recherche produit, aucun résultat commercial', async () => {
  const h = harness('components/lists/ListQuickAdd.tsx', { kind: 'articles' }); await search(h);
  assert.equal(h.calls.some(c => c[0] === 'api' && c[1].includes('/offers')), false);
  assert.equal(label(h, 'Ajouter le produit Lait 2 %, maxi'), undefined);
});


test('trois suggestions maximum, pagination remplaçant la page et récents en lignes', async () => {
  const recents = Array.from({ length: 6 }, (_, i) => ({ name: `Récent ${i}`, ingredient_id: null }));
  const h = harness('components/lists/ListQuickAdd.tsx', { recents, api: async url => {
    const offset = Number(new URLSearchParams(url.split('?')[1]).get('offset'));
    return { items: Array.from({ length: 3 }, (_, i) => ({ id: `ing_${offset + i}`, name: `Article ${offset + i}` })), total: 6 };
  } });
  await h.ready(); input(h).props.onFocus(); h.render(); await h.timers();
  const recentRows = nodes(h.render()).filter(n => n.props.accessibilityLabel?.includes('depuis les récents'));
  assert.equal(recentRows.length, 3); assert.ok(recentRows.every(n => n.type === 'Pressable'));
  assert.equal(button(h, 'Ajouter Récent 0'), undefined);
  assert.ok(label(h, 'Ajouter l’article Article 0, sans choisir de produit'));
  button(h, 'Autres suggestions').props.onPress(); h.render(); await h.timers();
  assert.equal(label(h, 'Ajouter l’article Article 0, sans choisir de produit'), undefined);
  assert.ok(label(h, 'Ajouter l’article Article 3, sans choisir de produit'));
  assert.equal(nodes(h.render()).filter(n => n.props.accessibilityLabel?.startsWith('Ajouter l’article')).length, 3);
});

test('les récents produits gardent leur identité et ne deviennent jamais des articles libres', async () => {
  const recents = [{ name: 'Ancien article', ingredient_id: null }, { name: 'Lait 2 %', ingredient_id: 'ing_lait', product_id: 'maxi:1:lait' }];
  const h = harness('components/lists/ListQuickAdd.tsx', { kind: 'products', recents }); await h.ready();
  input(h).props.onFocus(); h.render(); await h.timers();
  assert.equal(label(h, 'Ajouter Ancien article depuis les récents'), undefined);
  label(h, 'Ajouter Lait 2 % depuis les récents').props.onPress(); await flush();
  assert.equal(h.commands[0].body.product_id, 'maxi:1:lait');
});


test('ajout dans une sauvegarde : recherche ingrédient puis PATCH immédiat sans produit ni quantité obligatoire', async () => {
  const template = { id: 'template', revision: 4, kind: 'articles', items: [{ id: 'old-item', name: 'Pain', ingredient_id: null, category: 'Autres', required: [], preferred_product_id: null }] };
  const h = harness('components/lists/ListQuickAdd.tsx', { props: { list: undefined, template } }); await search(h);
  label(h, 'Ajouter l’article Lait, sans choisir de produit').props.onPress(); await flush();
  assert.equal(h.commands[0].method, 'PATCH'); assert.equal(h.commands[0].path, '/api/v1/shopping-list-templates/template');
  assert.equal(h.commands[0].body.expected_revision, 4);
  assert.equal(h.commands[0].body.items.length, 2);
  assert.deepEqual(json(h.commands[0].body.items[0]), template.items[0]);
  const item = h.commands[0].body.items[1];
  assert.equal(item.name, 'Lait'); assert.equal(item.ingredient_id, 'ing_lait');
  assert.equal(item.preferred_product_id, null); assert.deepEqual(json(item.required), []);
  assert.equal(template.items.length, 1); assert.equal(input(h).props.value, '');
  assert.equal(h.calls.some(c => c[0] === 'api' && c[1].includes('/offers')), false);
});
