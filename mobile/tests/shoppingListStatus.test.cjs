const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
function ui(relative) {
  const slots = []; let cursor = 0;
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], value => { slots[i] = value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
  };
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require(name) {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react-native') return { View: 'View', Text: 'Text', TextInput: 'TextInput',
      Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator', Platform: { OS: 'ios' }, StyleSheet: { create: v => v } };
    if (name.endsWith('/recipes')) return { recipeColors: {}, recipeStyles: {} };
    if (name.endsWith('/promos')) return { money: n => String(n), storeName: s => s };
    if (name.endsWith('/shoppingList')) return { MAGASINS: [], suggerer: () => [] };
    if (name.endsWith('/ShoppingListStatus')) return { __esModule: true, default: ui('components/ShoppingListStatus.tsx').component };
    return { __esModule: true, default: name };
  } });
  return { component: exports.default, render(props) { cursor = 0; return exports.default(props); } };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(typeof tree.type === 'function' ? tree.type(tree.props) : tree.props?.children)];
}
function text(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (!tree || typeof tree !== 'object') return '';
  if (Array.isArray(tree)) return tree.map(text).join(' ');
  return text(typeof tree.type === 'function' ? tree.type(tree.props) : tree.props?.children);
}
for (const failure of ['false', 'throw']) test(`ajout ${failure} : conserver la saisie et la vider seulement après confirmation`, async () => {
  const h = ui('components/AddItemField.tsx'); let ok = false, resolve;
  const props = { contexte: null, onAjouter: () => {
    if (ok) return new Promise(r => { resolve = r; });
    if (failure === 'throw') throw new Error('disk');
    return Promise.resolve(false);
  } };
  const input = () => nodes(h.render(props)).find(n => n.type === 'TextInput');
  input().props.onChangeText('Pain');
  await input().props.onSubmitEditing(); await new Promise(r => setImmediate(r));
  assert.equal(input().props.value, 'Pain');
  if (failure === 'throw') assert.match(text(h.render(props)), /non enregistré/);
  ok = true; input().props.onSubmitEditing();
  assert.equal(input().props.value, 'Pain'); assert.equal(input().props.editable, false);
  resolve(true); await new Promise(r => setImmediate(r)); assert.equal(input().props.value, '');
});
test('liste partielle vide : afficher l’avertissement, sans annoncer liste vide ou courses terminées', () => {
  const liste = { lignes: [], aAcheter: [], pasIci: [], cochees: [], chezMoi: [], totaux: {},
    magasin: 'maxi', chargement: false, nbRepasExclus: 1, avertissement: 'Liste partielle : 1 repas sans recette accessible.' };
  const tree = ui('components/ShoppingListView.tsx').render({ liste });
  assert.match(text(tree), /Liste partielle/); assert.doesNotMatch(text(tree), /liste de la semaine est vide|Bonne épicerie|Rien d'autre/);
});
test('chargement et enregistrement : boutons de reprise distincts', async () => {
  let reads = 0, writes = 0;
  const tree = ui('components/ShoppingListStatus.tsx').render({ liste: {
    erreurChargement: 'Lecture impossible', erreurEnregistrement: 'Écriture impossible',
    recharger: () => reads++, reessayerEnregistrement: () => writes++, chargement: false,
  } });
  const buttons = nodes(tree).filter(n => n.type === 'Pressable');
  buttons[0].props.onPress(); assert.equal(reads, 1); assert.equal(writes, 0);
  buttons[1].props.onPress(); assert.equal(reads, 1); assert.equal(writes, 1);
});

test('montant conservé ou partiel : libellé explicite au lieu d’un total présenté comme complet', () => {
  const liste = { lignes: [{}], aAcheter: [], pasIci: [], cochees: [], chezMoi: [],
    totaux: { total: 5, economies: 0 }, magasin: 'maxi', chargement: false,
    erreur: 'panne', erreurChargement: 'Actualisation impossible', nbRepasExclus: 0 };
  assert.match(text(ui('components/ShoppingListView.tsx').render({ liste })), /Dernier montant chargé/);
  liste.erreur = null; liste.erreurChargement = null; liste.nbRepasExclus = 1;
  liste.avertissement = 'Liste partielle';
  const result = text(ui('components/ShoppingListView.tsx').render({ liste }));
  assert.match(result, /Sous-total des repas accessibles/); assert.doesNotMatch(result, /Bonne épicerie/);
});
