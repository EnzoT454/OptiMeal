const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const empty = () => ({ average: null, count: 0, criteria: { taste: null, reliability: null, ease: null } });
const previous = { recipe_version: 1, taste_score: 5, reliability_score: 4, ease_score: 3, created_at: '2026-11-02', updated_at: '2026-11-02' };
class ApiError extends Error { constructor(status, message = 'Service indisponible') { super(message); this.status = status; } }
const flush = () => new Promise(setImmediate);

// Comme les tests des autres écrans, exercer le vrai composant avec des
// ports natifs simulés ; chaque rendu conserve ses hooks et leurs nettoyages.
function panel({ signedIn = true, owned = false, visibility = 'public', myRating = null, rating = empty(), version = 1, respond } = {}) {
  let recipe = { id: 'recipe_test', name: 'Soupe', visibility, is_owned: owned, my_rating: myRating, rating, content_version: version };
  let disabled = false, cursor = 0;
  const hooks = [], effects = [], calls = [], updates = [], alerts = [], signIns = [], busyChanges = [];
  let unavailable = 0;
  const auth = { session: signedIn ? { user: { id: 'alice' } } : null, requestSignIn: text => signIns.push(text) };
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
  const ui = new Proxy({}, { get: (_, key) => key });
  const styles = new Proxy({}, { get: () => ({}) });
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../components/RecipeRatingPanel.tsx'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require: name => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (name === 'react') return {
      useState(initial) {
        const index = cursor++;
        if (!hooks[index]) hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
        return [hooks[index].value, next => { hooks[index].value = typeof next === 'function' ? next(hooks[index].value) : next; }];
      },
      useRef(initial) { const index = cursor++; return hooks[index] ?? (hooks[index] = { current: initial }); },
      useEffect(fn, deps) {
        const index = cursor++;
        if (!hooks[index] || deps.some((value, i) => !Object.is(value, hooks[index].deps[i]))) {
          effects.push(() => { hooks[index]?.cleanup?.(); hooks[index] = { deps, cleanup: fn() }; });
        }
      },
    };
    if (name === 'react-native') return { Text: 'Text', View: 'View', Pressable: 'Pressable', Modal: 'Modal', ScrollView: 'ScrollView',
      Alert: { alert: (...args) => alerts.push(args) } };
    if (name.includes('safe-area-context')) return { SafeAreaView: 'SafeAreaView' };
    if (name.includes('AuthContext')) return { useAuth: () => auth };
    if (name.endsWith('services/api')) return { ApiError, api: async (url, options = {}) => {
      calls.push({ url, options });
      return respond ? respond(url, options, calls.length) : { item: recipe };
    } };
    if (name === './recipes') return { RecipeButton: 'RecipeButton', recipeColors: {}, recipeStyles: styles };
    return ui;
  } });
  const onBusyChange = value => busyChanges.push(value);
  function render() {
    cursor = 0;
    const tree = exports.default({ recipe, disabled, onChange: value => { recipe = value; updates.push(value); }, onUnavailable: () => { unavailable++; }, onBusyChange });
    while (effects.length) effects.shift()();
    return tree;
  }
  function unmount() { for (const hook of hooks) hook?.cleanup?.(); }
  return { render, unmount, calls, updates, alerts, signIns, auth, busyChanges,
    disable: () => { disabled = true; }, get recipe() { return recipe; }, get unavailable() { return unavailable; } };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (tree.type === 'Modal' && !tree.props.visible) return [tree];
  return [tree, ...nodes(tree.props?.children)];
}
const button = (tree, title) => nodes(tree).find(node => node.props?.title === title);
const modal = tree => nodes(tree).find(node => node.type === 'Modal');
const radios = tree => nodes(tree).filter(node => node.props?.accessibilityRole === 'radio');
const text = tree => nodes(tree).flatMap(node => [node.props?.children, node.props?.text]).flat(Infinity).filter(value => typeof value === 'string').join(' ');
const choose = (p, label, score) => nodes(p.render()).find(node => node.props?.accessibilityLabel === `${label} : ${score} sur 5`).props.onPress();
const open = p => button(p.render(), p.recipe.my_rating?.recipe_version < p.recipe.content_version ? 'Réévaluer la recette' : p.recipe.my_rating ? 'Modifier mon évaluation' : 'Noter cette recette').props.onPress();
const fill = p => { choose(p, 'Goût', 5); choose(p, 'Fiabilité', 4); choose(p, 'Facilité', 3); };
const confirmDelete = p => p.alerts.at(-1)[2].find(action => action.style === 'destructive').onPress();

test('sans avis : aucune note zéro et connexion à la demande sans écriture', () => {
  const p = panel({ signedIn: false });
  assert.match(text(p.render()), /Pas encore évaluée/);
  assert.doesNotMatch(text(p.render()), /0\/5/);
  open(p);
  assert.equal(p.signIns.length, 1);
  assert.equal(p.calls.length, 0);
  assert.equal(modal(p.render()).props.visible, false);
});

for (const options of [{ owned: true }, { visibility: 'private' }]) {
  test(`notation non proposée : ${JSON.stringify(options)}`, () => {
    const p = panel(options);
    assert.equal(button(p.render(), 'Noter cette recette'), undefined);
    assert.equal(p.calls.length, 0);
  });
}

test('introduction puis critères, questions et étoiles sans explications supplémentaires ; trois choix obligatoires', () => {
  const p = panel(); open(p);
  const content = text(p.render());
  for (const expected of ['As-tu apprécié le résultat ?', 'Les ingrédients et les étapes étaient-ils suffisamment complets pour obtenir le résultat annoncé ?',
    'La préparation était-elle facile à réaliser ?', 'Après avoir préparé cette recette, partage ton expérience.']) assert.ok(content.includes(expected));
  assert.doesNotMatch(content, /selon tes préférences|informations importantes manquantes|effort et les techniques|La facilité évaluée ici|Note globale|40 %/);
  assert.equal(radios(p.render()).length, 15);
  assert.equal(radios(p.render()).filter(node => node.props.accessibilityState.checked).length, 0);
  choose(p, 'Goût', 5); choose(p, 'Fiabilité', 4);
  assert.equal(button(p.render(), 'Enregistrer mon évaluation').props.disabled, true);
  choose(p, 'Facilité', 3);
  assert.equal(button(p.render(), 'Enregistrer mon évaluation').props.disabled, false);
  assert.equal(radios(p.render()).filter(node => node.props.accessibilityState.checked).length, 3);
});

test('annuler et retour Android ferment sans sauvegarder ; la nouvelle saisie repart vide', () => {
  const p = panel(); open(p); fill(p);
  button(p.render(), 'Annuler').props.onPress();
  assert.equal(p.calls.length, 0);
  open(p);
  assert.equal(radios(p.render()).some(node => node.props.accessibilityState.checked), false);
  modal(p.render()).props.onRequestClose();
  assert.equal(modal(p.render()).props.visible, false);
});

test('modifier précharge uniquement les trois notes enregistrées', () => {
  const p = panel({ myRating: previous }); open(p);
  assert.deepEqual(radios(p.render()).filter(node => node.props.accessibilityState.checked).map(node => node.props.accessibilityLabel),
    ['Goût : 5 sur 5', 'Fiabilité : 4 sur 5', 'Facilité : 3 sur 5']);
  assert.ok(button(p.render(), 'Supprimer mon évaluation'));
});

test('sauvegarde : attendre le serveur, ignorer le double clic et mettre à jour la fiche confirmée', async () => {
  let resolve;
  const p = panel({ respond: () => new Promise(done => { resolve = done; }) });
  open(p); fill(p);
  const action = button(p.render(), 'Enregistrer mon évaluation').props.onPress;
  action(); action();
  assert.equal(p.calls.length, 1);
  assert.equal(p.calls[0].options.method, 'PUT');
  assert.deepEqual(JSON.parse(p.calls[0].options.body), { recipe_version: 1, taste_score: 5, reliability_score: 4, ease_score: 3 });
  assert.equal(p.updates.length, 0);
  assert.deepEqual(p.busyChanges, [true]);
  assert.ok(radios(p.render()).every(node => node.props.disabled));
  modal(p.render()).props.onRequestClose();
  assert.equal(modal(p.render()).props.visible, true);
  resolve({ item: { ...p.recipe, my_rating: previous, rating: { average: '4.20', count: 1, criteria: { taste: '5', reliability: '4', ease: '3' } } } });
  await flush();
  assert.equal(p.updates.length, 1);
  assert.deepEqual(p.busyChanges, [true, false]);
  assert.equal(modal(p.render()).props.visible, false);
  assert.match(text(p.render()), /4,2\/5 · 1 évaluation/);
  assert.ok(button(p.render(), 'Modifier mon évaluation'));
});

test('échec réseau : conserver les notes et permettre une nouvelle soumission', async () => {
  const p = panel({ respond: () => Promise.reject(new Error('Réseau indisponible')) });
  open(p); fill(p);
  button(p.render(), 'Enregistrer mon évaluation').props.onPress(); await flush();
  assert.equal(modal(p.render()).props.visible, true);
  assert.equal(radios(p.render()).filter(node => node.props.accessibilityState.checked).length, 3);
  assert.match(text(p.render()), /n’a pas pu être confirmé/);
  assert.equal(p.updates.length, 0);
  button(p.render(), 'Enregistrer mon évaluation').props.onPress(); await flush();
  assert.equal(p.calls.length, 2);
});

for (const status of [401, 404]) {
  test(`échec ${status} : fermer le formulaire et traiter la perte d’accès`, async () => {
    const p = panel({ respond: () => Promise.reject(new ApiError(status)) });
    open(p); fill(p); button(p.render(), 'Enregistrer mon évaluation').props.onPress(); await flush();
    assert.equal(modal(p.render()).props.visible, false);
    assert.equal(p.updates.length, 0);
    assert.equal(p.unavailable, status === 404 ? 1 : 0);
    assert.equal(p.signIns.length, status === 401 ? 1 : 0);
  });
}

test('suppression annulée : aucune requête ; confirmation : DELETE puis lecture des moyennes', async () => {
  const p = panel({ myRating: previous, respond: (url, options) => options.method === 'DELETE' ? undefined :
    { item: { ...p.recipe, my_rating: null, rating: empty() } } });
  open(p); button(p.render(), 'Supprimer mon évaluation').props.onPress();
  assert.equal(p.calls.length, 0);
  assert.equal(p.alerts[0][2][0].text, 'Annuler');
  confirmDelete(p); await flush();
  assert.equal(p.calls[0].options.method, 'DELETE');
  assert.equal(p.calls[1].options.method, undefined);
  assert.equal(p.recipe.my_rating, null);
  assert.match(text(p.render()), /Pas encore évaluée/);
  assert.ok(button(p.render(), 'Noter cette recette'));
});

test('suppression échouée : conserver la note personnelle et les moyennes confirmées', async () => {
  const p = panel({ myRating: previous, respond: () => Promise.reject(new Error('Réseau')) });
  open(p); button(p.render(), 'Supprimer mon évaluation').props.onPress(); confirmDelete(p); await flush();
  assert.equal(p.recipe.my_rating, previous);
  assert.equal(modal(p.render()).props.visible, true);
  assert.match(text(p.render()), /suppression n’a pas pu être confirmée/);
});

test('DELETE réussi, GET échoué : ne pas inventer de moyennes ; actualiser sans refaire DELETE', async () => {
  const p = panel({ myRating: previous, rating: { average: '4.20', count: 1, criteria: { taste: '5', reliability: '4', ease: '3' } },
    respond: (url, options, call) => {
      if (options.method === 'DELETE') return undefined;
      if (call === 2) throw new Error('Réseau');
      return { item: { ...p.recipe, my_rating: null, rating: empty() } };
    } });
  open(p); button(p.render(), 'Supprimer mon évaluation').props.onPress(); confirmDelete(p); await flush();
  assert.equal(p.recipe.my_rating, null);
  assert.match(text(p.render()), /Moyennes à actualiser/);
  assert.doesNotMatch(text(p.render()), /4,2/);
  assert.equal(button(p.render(), 'Noter cette recette'), undefined);
  button(p.render(), 'Actualiser les moyennes').props.onPress(); await flush();
  assert.equal(p.calls.filter(call => call.options.method === 'DELETE').length, 1);
  assert.match(text(p.render()), /Pas encore évaluée/);
});

test('désactivation pendant une autre action empêche l’ouverture', () => {
  const p = panel(); p.disable();
  button(p.render(), 'Noter cette recette').props.onPress();
  assert.equal(modal(p.render()).props.visible, false);
  assert.equal(p.calls.length, 0);
});

test('réponse tardive après démontage : aucune mise à jour du compte ou de la fiche suivante', async () => {
  let resolve;
  const p = panel({ respond: () => new Promise(done => { resolve = done; }) });
  open(p); fill(p); button(p.render(), 'Enregistrer mon évaluation').props.onPress();
  p.unmount();
  assert.deepEqual(p.busyChanges, [true, false]);
  resolve({ item: { ...p.recipe, my_rating: previous } }); await flush();
  assert.equal(p.updates.length, 0);
  assert.equal(p.signIns.length, 0);
  assert.equal(p.unavailable, 0);
});

test('affichage français à une décimale sans exposer le score de classement', () => {
  const p = panel({ rating: { average: '4.326666666666666666666666667', count: 3,
    criteria: { taste: '4.8', reliability: '4.5', ease: '3' } } });
  const content = text(p.render());
  assert.match(content, /4,3\/5 · 3 évaluations/);
  assert.match(content, /Goût :/); assert.match(content, /4,8\/5/);
  assert.doesNotMatch(content, /Note globale|40 %|20 %|ranking_score|bayésien/);
});

test('ancienne version : identifier les anciennes notes et proposer une réévaluation sans présélection', async () => {
  const p = panel({ version: 2, myRating: previous, respond: (url, options) => ({ item: {
    ...p.recipe, my_rating: { ...previous, ...JSON.parse(options.body) }, rating: { ...empty(), average: '4.20', count: 1 },
  } }) });
  assert.match(text(p.render()), /ancienne version/);
  assert.match(text(p.render()), /Tes anciennes notes/);
  assert.ok(button(p.render(), 'Réévaluer la recette'));
  open(p);
  assert.equal(radios(p.render()).some(node => node.props.accessibilityState.checked), false);
  fill(p); button(p.render(), 'Enregistrer mon évaluation').props.onPress(); await flush();
  assert.equal(JSON.parse(p.calls[0].options.body).recipe_version, 2);
  assert.equal(p.recipe.my_rating.recipe_version, 2);
  assert.doesNotMatch(text(p.render()), /ancienne version/);
});

test('conflit de version : abandonner la saisie, actualiser et demander une nouvelle évaluation explicite', async () => {
  const p = panel({ respond: (url, options, call) => {
    if (options.method === 'PUT') throw new ApiError(409);
    return { item: { ...p.recipe, content_version: 2, name: 'Soupe modifiée' } };
  } });
  open(p); fill(p); button(p.render(), 'Enregistrer mon évaluation').props.onPress(); await flush();
  assert.equal(modal(p.render()).props.visible, false);
  assert.match(text(p.render()), /La recette a changé/);
  assert.equal(button(p.render(), 'Noter cette recette'), undefined);
  assert.equal(p.updates.length, 0);
  button(p.render(), 'Actualiser la recette').props.onPress(); await flush();
  assert.equal(p.recipe.content_version, 2);
  assert.equal(p.calls.filter(call => call.options.method === 'PUT').length, 1);
  assert.equal(modal(p.render()).props.visible, false);
  open(p);
  assert.equal(radios(p.render()).some(node => node.props.accessibilityState.checked), false);
});

test('retirer une ancienne évaluation demande confirmation et utilise la suppression de toutes ses versions', async () => {
  const p = panel({ version: 2, myRating: previous }); open(p);
  button(p.render(), 'Supprimer mon évaluation').props.onPress();
  assert.match(p.alerts[0][1], /anciennes versions/);
  assert.equal(p.calls.length, 0);
  confirmDelete(p); await flush();
  assert.equal(p.calls[0].options.method, 'DELETE');
});
