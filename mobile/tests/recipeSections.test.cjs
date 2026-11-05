const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function screen({ signedIn = true, respond = () => Promise.resolve({ items: [], total: 0 }) } = {}) {
  const states = [], refs = [], calls = [], requests = [], signIns = [], navigations = [];
  let cursor = 0, refCursor = 0, effect, cleanup;
  const auth = { session: signedIn ? { user: { id: 'alice' } } : null, requestSignIn: message => signIns.push(message) };
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const ui = new Proxy({}, { get: (_, name) => String(name) });
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../app/RecipeListScreen.tsx'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, URLSearchParams, require: name => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (name === 'react') return { useCallback: fn => fn,
      useRef(initial) { const index = refCursor++; return refs[index] ?? (refs[index] = { current: initial }); }, useState(initial) {
      const index = cursor++;
      if (!Object.hasOwn(states, index)) states[index] = initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    } };
    if (name === '@react-navigation/native') return { useFocusEffect: fn => { effect = fn; } };
    if (name.includes('AuthContext')) return { useAuth: () => auth };
    if (name.endsWith('services/api')) return { api: (url, options) => { calls.push(url); requests.push({ url, options }); return respond(url, options); } };
    return ui;
  } });
  const render = () => { cursor = 0; refCursor = 0; return exports.default({ navigation: { navigate: (...args) => navigations.push(args) } }); };
  const focus = () => { if (cleanup) cleanup(); cleanup = effect(); };
  const load = async () => { render(); focus(); await new Promise(setImmediate); return render(); };
  return { render, focus, load, calls, requests, signIns, navigations, auth };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const tab = (tree, label) => nodes(tree).find(n => n.props?.accessibilityRole === 'tab' && n.props.accessibilityLabel === label);
const button = (tree, title) => nodes(tree).find(n => n.props?.title === title);
const field = tree => nodes(tree).find(n => n.props?.label === 'Rechercher');
const chip = (tree, label) => nodes(tree).find(n => n.props?.label === label);
const sortButton = (tree, label) => nodes(tree).find(n => n.props?.accessibilityRole === 'radio' && n.props.accessibilityLabel === label);
const params = url => new URLSearchParams(url.split('?')[1]);
const content = tree => nodes(tree).flatMap(n => Array.isArray(n.props?.children) ? n.props.children : [n.props?.children]).filter(v => typeof v === 'string').join(' ');
const recipe = { id: 'recipe_a', name: 'Soupe', servings: 2, total_time_minutes: 20, ingredient_count: 6, step_count: 4, visibility: 'private', is_owned: true, is_favorite: false, published_at: null,
  rating: { average: null, count: 0, criteria: { taste: null, reliability: null, ease: null } } };
const favoriteButton = tree => nodes(tree).find(n => /^(Ajouter aux favoris|Retirer des favoris) :/.test(n.props?.accessibilityLabel ?? ''));
const flush = () => new Promise(setImmediate);

test('cœur de carte : ajout puis retrait confirmés, sans ouvrir le détail ; deux boutons accessibles indépendants', async () => {
  let saved = false;
  const s = screen({ respond: (url, options) => {
    if (options) { saved = options.method === 'PUT'; return Promise.resolve(); }
    return Promise.resolve({ items: [{ ...recipe, is_favorite: saved }], total: 1 });
  } });
  let tree = await s.load();
  const open = nodes(tree).find(n => n.props?.accessibilityLabel?.startsWith('Ouvrir la recette :'));
  const heart = favoriteButton(tree);
  assert.ok(nodes(tree).some(n => Array.isArray(n.props?.children) && n.props.children.includes(open) && n.props.children.includes(heart)));
  assert.equal(heart.props.accessibilityState.selected, false);
  assert.equal(heart.props.style({ pressed: false }).width, 48);
  assert.equal(heart.props.style({ pressed: false }).height, 48);
  heart.props.onPress(); await flush(); tree = s.render();
  assert.equal(s.requests.at(-1).options.method, 'PUT');
  assert.equal(s.requests.at(-1).url, '/api/v1/recipes/recipe_a/favorite');
  assert.equal(favoriteButton(tree).props.accessibilityState.selected, true);
  favoriteButton(tree).props.onPress(); await flush(); tree = s.render();
  assert.equal(s.requests.at(-1).options.method, 'DELETE');
  assert.equal(favoriteButton(tree).props.accessibilityState.selected, false);
  assert.equal(s.navigations.length, 0);
});

test('cœur visiteur : demander la connexion sans écrire ni ouvrir le détail', async () => {
  const s = screen({ signedIn: false, respond: () => Promise.resolve({ items: [recipe], total: 1 }) });
  favoriteButton(await s.load()).props.onPress(); await flush();
  assert.equal(s.signIns.length, 1);
  assert.equal(s.requests.filter(r => r.options).length, 0);
  assert.equal(s.navigations.length, 0);
});

test('cœur en attente : bloquer les doubles appuis et conserver l’état confirmé', async () => {
  let finish;
  const s = screen({ respond: (url, options) => options ? new Promise(resolve => { finish = resolve; }) :
    Promise.resolve({ items: [recipe], total: 1 }) });
  const heart = favoriteButton(await s.load());
  heart.props.onPress(); heart.props.onPress();
  const pending = favoriteButton(s.render());
  assert.equal(s.requests.filter(r => r.options).length, 1);
  assert.equal(pending.props.disabled, true);
  assert.equal(pending.props.accessibilityState.busy, true);
  assert.equal(pending.props.accessibilityState.selected, false);
  finish(); await flush();
  assert.equal(favoriteButton(s.render()).props.disabled, false);
  assert.equal(favoriteButton(s.render()).props.accessibilityState.selected, true);
});

test('échec du cœur : conserver la carte et son état, puis permettre de réessayer', async () => {
  let fail = true;
  const s = screen({ respond: (url, options) => options
    ? fail ? Promise.reject(new Error('Réseau indisponible')) : Promise.resolve()
    : Promise.resolve({ items: [{ ...recipe, is_favorite: true }], total: 1 }) });
  favoriteButton(await s.load()).props.onPress(); await flush();
  let tree = s.render();
  assert.ok(nodes(tree).some(n => n.props?.text === 'Réseau indisponible'));
  assert.match(content(tree), /Soupe/);
  assert.equal(favoriteButton(tree).props.accessibilityState.selected, true);
  assert.equal(favoriteButton(tree).props.disabled, false);
  fail = false; favoriteButton(tree).props.onPress(); await flush(); tree = s.render();
  assert.equal(favoriteButton(tree).props.accessibilityState.selected, false);
  assert.equal(nodes(tree).some(n => n.props?.text === 'Réseau indisponible'), false);
});

test('retrait du dernier favori d’une page : revenir à la page précédente et recharger compte et filtres', async () => {
  let removed = false;
  const s = screen({ respond: (url, options) => {
    if (options) { removed = true; return Promise.resolve(); }
    return Promise.resolve({ items: [{ ...recipe, id: removed ? 'recipe_other' : recipe.id, is_favorite: true }], total: removed ? 20 : 21 });
  } });
  let tree = await s.load();
  tab(tree, 'Favoris').props.onPress(); tree = await s.load();
  chip(tree, 'Faciles').props.onPress(); tree = await s.load();
  field(tree).props.onChangeText('soupe'); tree = await s.load();
  button(tree, 'Page suivante').props.onPress(); tree = await s.load();
  favoriteButton(tree).props.onPress(); await flush(); tree = await s.load();
  const query = params(s.calls.at(-1));
  assert.equal(query.get('scope'), 'favorites');
  assert.equal(query.get('easy'), 'true');
  assert.equal(query.get('q'), 'soupe');
  assert.equal(query.get('offset'), '0');
  assert.match(content(tree), /20 recettes/);
  const open = nodes(tree).find(n => n.props?.accessibilityLabel?.startsWith('Ouvrir la recette :'));
  open.props.onPress();
  assert.equal(s.navigations.at(-1)[1].id, 'recipe_other');
});

test('réponse tardive du cœur : ne pas modifier une autre section, recharger après confirmation', async () => {
  let finish;
  const s = screen({ respond: (url, options) => options ? new Promise(resolve => { finish = resolve; }) :
    Promise.resolve({ items: [recipe], total: 1 }) });
  let tree = await s.load();
  favoriteButton(tree).props.onPress();
  tab(s.render(), 'Mes recettes').props.onPress(); tree = await s.load();
  finish(); await flush();
  assert.equal(favoriteButton(s.render()).props.accessibilityState.selected, false);
  assert.equal(favoriteButton(s.render()).props.disabled, false);
  await s.load();
  assert.equal(params(s.calls.at(-1)).get('scope'), 'mine');
});

test('Faciles : filtrer côté serveur, réinitialiser la page et conserver recherche et section', async () => {
  const s = screen({ respond: () => Promise.resolve({ items: [recipe], total: 45 }) });
  let tree = await s.load();
  tab(tree, 'Favoris').props.onPress(); tree = await s.load();
  field(tree).props.onChangeText('soupe'); tree = await s.load();
  button(tree, 'Page suivante').props.onPress(); tree = await s.load();
  chip(tree, 'Faciles').props.onPress(); tree = await s.load();
  let query = params(s.calls.at(-1));
  assert.equal(query.get('easy'), 'true');
  assert.equal(query.get('offset'), '0');
  assert.equal(query.get('scope'), 'favorites');
  assert.equal(query.get('q'), 'soupe');
  assert.equal(query.has('quick'), false);
  chip(tree, 'Toutes').props.onPress(); tree = await s.load();
  assert.equal(params(s.calls.at(-1)).has('easy'), false);
});

test('Découvrir par défaut et sections personnelles protégées pour un visiteur', async () => {
  const s = screen({ signedIn: false });
  const tree = await s.load();
  assert.equal(nodes(tree).filter(n => n.props?.accessibilityRole === 'tab').length, 3);
  assert.equal(tab(tree, 'Découvrir').props.accessibilityState.selected, true);
  assert.equal(params(s.calls[0]).get('scope'), 'discover');
  assert.equal(params(s.calls[0]).get('sort'), 'top');
  tab(tree, 'Mes recettes').props.onPress();
  tab(tree, 'Favoris').props.onPress();
  assert.equal(s.signIns.length, 2);
  assert.equal(tab(s.render(), 'Découvrir').props.accessibilityState.selected, true);
  assert.equal(s.calls.length, 1);
  assert.equal(chip(tree, 'Favoris'), undefined);
});

test('recherche, Rapides et pagination restent dans la section active ; changer de section réinitialise la page', async () => {
  const s = screen({ respond: () => Promise.resolve({ items: [recipe], total: 45 }) });
  let tree = await s.load();
  tab(tree, 'Mes recettes').props.onPress();
  tree = await s.load();
  assert.equal(params(s.calls.at(-1)).get('scope'), 'mine');
  assert.equal(params(s.calls.at(-1)).get('sort'), 'newest');
  assert.match(content(tree), /Par vous\s+· Privée/);
  assert.match(content(tree), /Par vous/);
  field(tree).props.onChangeText('soupe');
  tree = await s.load();
  chip(tree, 'Rapides').props.onPress();
  tree = await s.load();
  button(tree, 'Page suivante').props.onPress();
  tree = await s.load();
  let query = params(s.calls.at(-1));
  assert.equal(query.get('scope'), 'mine');
  assert.equal(query.get('q'), 'soupe');
  assert.equal(query.get('quick'), 'true');
  assert.equal(query.get('offset'), '20');
  tab(tree, 'Favoris').props.onPress();
  assert.doesNotMatch(content(s.render()), /Soupe/);
  tree = await s.load();
  query = params(s.calls.at(-1));
  assert.equal(query.get('scope'), 'favorites');
  assert.equal(query.get('offset'), '0');
  assert.equal(query.get('q'), 'soupe');
  assert.equal(query.get('quick'), 'true');
  assert.equal(query.has('favorites'), false);
  assert.doesNotMatch(content(tree), /· Privée/);
});

test('états vides : créer sa première recette, découvrir depuis Favoris et effacer une recherche', async () => {
  const s = screen();
  let tree = await s.load();
  tab(tree, 'Mes recettes').props.onPress();
  tree = await s.load();
  button(tree, 'Ajouter ma première recette').props.onPress();
  assert.equal(s.navigations[0][0], 'Add');
  tab(tree, 'Favoris').props.onPress();
  tree = await s.load();
  button(tree, 'Découvrir des recettes').props.onPress();
  tree = await s.load();
  assert.equal(params(s.calls.at(-1)).get('scope'), 'discover');
  field(tree).props.onChangeText('introuvable');
  tree = await s.load();
  button(tree, 'Effacer la recherche et les filtres').props.onPress();
  await s.load();
  assert.equal(params(s.calls.at(-1)).get('q'), '');
});

test('recettes publiées de soi, de la communauté et de l’app : source et badge explicites', async () => {
  const s = screen({ respond: () => Promise.resolve({ items: [
    { ...recipe, visibility: 'public', published_at: '2026-11-01T12:00:00Z' },
    { ...recipe, id: 'recipe_b', is_owned: false, visibility: 'public', published_at: '2026-11-01T12:00:00Z' },
    { ...recipe, id: 'recipe_c', is_owned: false, visibility: 'public' },
  ], total: 3 }) });
  let tree = await s.load();
  assert.match(content(tree), /Par vous/);
  assert.match(content(tree), /Par la communauté/);
  assert.match(content(tree), /Par OptiMeal/);
  tab(tree, 'Mes recettes').props.onPress();
  tree = await s.load();
  assert.match(content(tree), /Par vous\s+· Publique/);
});

test('une réponse de la section précédente est ignorée après changement', async () => {
  let finish;
  const s = screen({ respond: url => params(url).get('scope') === 'discover'
    ? new Promise(resolve => { finish = resolve; })
    : Promise.resolve({ items: [recipe], total: 1 }) });
  let tree = s.render(); s.focus();
  tab(tree, 'Mes recettes').props.onPress();
  tree = await s.load();
  assert.match(content(tree), /Soupe/);
  finish({ items: [{ ...recipe, name: 'Ancienne réponse' }], total: 100 });
  await new Promise(setImmediate);
  tree = s.render();
  assert.match(content(tree), /Soupe/);
  assert.doesNotMatch(content(tree), /Ancienne réponse/);
});

test('réessayer et revenir sur l’écran rechargent la même section ; Petit budget conserve son attente', async () => {
  let fail = false;
  const s = screen({ respond: () => fail ? Promise.reject(new Error('Réseau indisponible')) : Promise.resolve({ items: [], total: 0 }) });
  let tree = await s.load();
  tab(tree, 'Favoris').props.onPress(); fail = true;
  tree = await s.load();
  assert.ok(button(tree, 'Réessayer'));
  fail = false; button(tree, 'Réessayer').props.onPress();
  tree = await s.load();
  assert.equal(params(s.calls.at(-1)).get('scope'), 'favorites');
  await s.load();
  assert.equal(params(s.calls.at(-1)).get('scope'), 'favorites');
  chip(tree, 'Petit budget').props.onPress();
  const before = s.calls.length;
  tree = await s.load();
  assert.equal(s.calls.length, before);
  assert.match(content(tree), /Disponible prochainement/);
});

test('changer le tri réinitialise la pagination sans perdre recherche ni filtre', async () => {
  const s = screen({ respond: () => Promise.resolve({ items: [recipe], total: 45 }) });
  let tree = await s.load();
  field(tree).props.onChangeText('soupe'); tree = await s.load();
  chip(tree, 'Rapides').props.onPress(); tree = await s.load();
  button(tree, 'Page suivante').props.onPress(); tree = await s.load();
  assert.equal(params(s.calls.at(-1)).get('offset'), '20');
  sortButton(tree, 'Plus récentes').props.onPress();
  assert.doesNotMatch(content(s.render()), /Soupe/);
  tree = await s.load();
  const query = params(s.calls.at(-1));
  assert.equal(query.get('sort'), 'newest');
  assert.equal(query.get('offset'), '0');
  assert.equal(query.get('q'), 'soupe');
  assert.equal(query.get('quick'), 'true');
  assert.equal(sortButton(tree, 'Plus récentes').props.accessibilityState.checked, true);
});

test('chaque section conserve son tri au retour, avec un défaut adapté', async () => {
  const s = screen(); let tree = await s.load();
  assert.ok(sortButton(tree, 'Mieux notées'));
  sortButton(tree, 'Plus récentes').props.onPress(); tree = await s.load();
  tab(tree, 'Mes recettes').props.onPress(); tree = await s.load();
  assert.equal(params(s.calls.at(-1)).get('sort'), 'newest');
  assert.equal(sortButton(tree, 'Mieux notées'), undefined);
  assert.equal(nodes(tree).some(n => n.props?.accessibilityLabel === 'Trier les recettes'), false);
  assert.equal(sortButton(tree, 'Modifiées récemment'), undefined);
  assert.equal(sortButton(tree, 'Créées récemment'), undefined);
  tab(tree, 'Favoris').props.onPress(); tree = await s.load();
  assert.equal(params(s.calls.at(-1)).get('sort'), 'top');
  tab(tree, 'Découvrir').props.onPress(); tree = await s.load();
  assert.equal(sortButton(tree, 'Plus récentes').props.accessibilityState.checked, true);
  tab(tree, 'Mes recettes').props.onPress(); tree = await s.load();
  assert.equal(params(s.calls.at(-1)).get('sort'), 'newest');
  assert.equal(nodes(tree).some(n => n.props?.accessibilityLabel === 'Trier les recettes'), false);
});

test('cartes : moyenne réelle, effectif et absence de votes sans appels supplémentaires ni retri local', async () => {
  const s = screen({ respond: () => Promise.resolve({ items: [
    { ...recipe, name: 'Premier résultat serveur', rating: { average: '4.326666666666666666666666667', count: 3 } },
    { ...recipe, id: 'recipe_b', name: 'Deuxième résultat serveur', rating: { average: '5', count: 1 } },
    { ...recipe, id: 'recipe_c', name: 'Sans vote' },
  ], total: 3 }) });
  const tree = await s.load(); const text = content(tree);
  assert.match(text, /4,3 \(3\)/);
  assert.match(text, /5,0 \(1\)/);
  assert.match(text, /Non notée/);
  assert.match(text, /6 ingr\./);
  assert.match(text, /4 étapes/);
  const card = nodes(tree).find(n => n.props?.accessibilityLabel?.startsWith('Ouvrir la recette : Premier résultat serveur'));
  assert.match(card.props.accessibilityLabel, /6 ingrédients, 4 étapes/);
  assert.match(card.props.accessibilityLabel, /4,3 sur 5, 3 évaluations/);
  card.props.onPress();
  assert.equal(s.navigations.at(-1)[0], 'Detail');
  assert.equal(s.navigations.at(-1)[1].id, recipe.id);
  assert.ok(text.indexOf('Premier résultat serveur') < text.indexOf('Deuxième résultat serveur'));
  assert.equal(s.calls.length, 1);
});

test('une ancienne réponse de tri est ignorée après sélection d’un autre tri', async () => {
  let finish;
  const s = screen({ respond: url => params(url).get('sort') === 'top'
    ? new Promise(resolve => { finish = resolve; })
    : Promise.resolve({ items: [{ ...recipe, name: 'Résultat récent' }], total: 1 }) });
  let tree = s.render(); s.focus();
  sortButton(tree, 'Plus récentes').props.onPress(); tree = await s.load();
  finish({ items: [{ ...recipe, name: 'Ancien classement' }], total: 100 });
  await new Promise(setImmediate);
  assert.match(content(s.render()), /Résultat récent/);
  assert.doesNotMatch(content(s.render()), /Ancien classement/);
});

test('retour du détail : recharger les notes en conservant le tri sélectionné', async () => {
  let count = 1;
  const s = screen({ respond: () => Promise.resolve({ items: [{ ...recipe, rating: { average: '4.5', count } }], total: 1 }) });
  let tree = await s.load();
  sortButton(tree, 'Plus récentes').props.onPress(); tree = await s.load();
  assert.match(content(tree), /4,5 \(1\)/);
  count = 2; tree = await s.load();
  assert.match(content(tree), /4,5 \(2\)/);
  assert.equal(params(s.calls.at(-1)).get('sort'), 'newest');
});
