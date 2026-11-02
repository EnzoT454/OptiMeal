const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

class ApiError extends Error { constructor(status) { super('Service indisponible'); this.status = status; } }
const emptyRating = { average: null, count: 0, criteria: { taste: null, reliability: null, ease: null } };
const recipes = [
  { id: 'recipe_soupe', name: 'Soupe', total_time_minutes: 20, servings: 2, ingredients: [{ ingredient_id: 'ing_a' }, { ingredient_id: 'ing_b' }],
    rating: { ...emptyRating, average: '2.326666666666666666666666667', count: 3 } },
  { id: 'recipe_salade', name: 'Salade', total_time_minutes: 10, servings: 2, ingredients: [{ ingredient_id: 'ing_a' }],
    rating: { ...emptyRating, average: '5', count: 1 } },
];

function screen({ detailFailure, listPages, detail = id => recipes.find(recipe => recipe.id === id), promotions } = {}) {
  const states = [], calls = [], navigations = [];
  let cursor = 0, effect, cleanup, promoCalls = 0;
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const ui = new Proxy({}, { get: (_, name) => name });
  const exports = {};
  const offers = promotions ?? [
    { id: 'offer_a', ingredient_id: 'ing_a', product_name: 'A', retailer: 'maxi', price: { amount: '2' } },
    { id: 'offer_b', ingredient_id: 'ing_b', product_name: 'B', retailer: 'metro', price: { amount: '3' } },
  ];
  const source = fs.readFileSync(path.join(__dirname, '../app/CookWithPromosScreen.tsx'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, Error, require: name => {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (name === 'react') return { useCallback: fn => fn, useState(initial) {
        const index = cursor++;
        if (!Object.hasOwn(states, index)) states[index] = initial;
        return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
      } };
      if (name === '@react-navigation/native') return { useFocusEffect: fn => { effect = fn; } };
      if (name === 'react-native') return { Text: 'Text', View: 'View', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: value => value } };
      if (name.endsWith('components/recipes')) return { ...ui, RecipeScreen: 'RecipeScreen', RecipeTitle: 'RecipeTitle', RecipeButton: 'RecipeButton', recipeColors: {}, recipeStyles: {} };
      if (name.endsWith('components/promos')) return {
        fetchPromos: async () => { promoCalls++; return offers; }, currentPrice: offer => offer.price.amount,
        discount: () => null, money: value => value + ' $', storeName: value => value,
      };
      if (name.endsWith('services/api')) return { ApiError, api: async (url, options) => {
        calls.push({ url, options });
        if (url.includes('?')) return listPages ? listPages(url) : { items: recipes.map(recipe => ({ id: recipe.id })), total: recipes.length };
        const id = url.split('/').at(-1);
        if (detailFailure?.id === id) throw new ApiError(detailFailure.status);
        return { item: await detail(id) };
      } };
      return ui;
    },
  });
  function render() {
    cursor = 0;
    return exports.default({ navigation: { getParent: () => ({ navigate: (...args) => navigations.push(args) }), goBack() {} } });
  }
  function focus() { cleanup?.(); cleanup = effect(); }
  async function load() { render(); focus(); await new Promise(setImmediate); return render(); }
  return { render, load, focus, calls, navigations, get promoCalls() { return promoCalls; } };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(typeof tree.type === 'function' ? tree.type(tree.props) : tree.props?.children)];
}
const content = tree => nodes(tree).flatMap(node => [node.props?.children, node.props?.text]).flat(Infinity).filter(value => typeof value === 'string').join(' ');
const button = (tree, title) => nodes(tree).find(node => node.props?.title === title);

test('promos : notes réelles visibles, classement par ingrédients conservé et fiche partagée sans vote automatique', async () => {
  const s = screen(); const tree = await s.load(); const text = content(tree);
  assert.match(text, /★ 2,3\/5 · 3 évaluations/);
  assert.match(text, /★ 5,0\/5 · 1 évaluation/);
  assert.ok(text.indexOf('Soupe') < text.indexOf('Salade'));
  const cards = nodes(tree).filter(node => node.props?.accessibilityHint === 'Ouvre la recette');
  cards[0].props.onPress();
  assert.equal(s.navigations[0][0], 'Recettes');
  assert.equal(s.navigations[0][1].screen, 'Detail');
  assert.equal(s.navigations[0][1].params.id, 'recipe_soupe');
  assert.equal(s.calls.length, 3); // Une page et les deux détails déjà nécessaires aux ingrédients.
  assert.ok(s.calls.every(call => !call.options && !call.url.endsWith('/rating')));
});

test('promos : absence de vote affichée sans valeur zéro', async () => {
  const s = screen({ detail: id => ({ ...recipes.find(recipe => recipe.id === id), rating: emptyRating }) });
  const text = content(await s.load());
  assert.match(text, /Pas encore évaluée/);
  assert.doesNotMatch(text, /0,0\/5/);
});

test('promos : recharger les notes au retour de la fiche', async () => {
  let count = 1;
  const s = screen({ detail: id => ({ ...recipes.find(recipe => recipe.id === id), rating: { ...emptyRating, average: '4.5', count } }) });
  assert.match(content(await s.load()), /1 évaluation/);
  count = 2;
  assert.match(content(await s.load()), /2 évaluations/);
  assert.equal(s.promoCalls, 2);
});

test('promos : une recette retirée du public entre liste et détail est ignorée, les autres restent disponibles', async () => {
  const s = screen({ detailFailure: { id: 'recipe_soupe', status: 404 } });
  const tree = await s.load(); const text = content(tree);
  assert.doesNotMatch(text, /Soupe/);
  assert.match(text, /Salade/);
  assert.equal(button(tree, 'Réessayer'), undefined);
});

test('promos : une panne reste une erreur et ne ressemble pas à une absence de recettes', async () => {
  const s = screen({ detailFailure: { id: 'recipe_soupe', status: 503 } });
  const tree = await s.load();
  assert.ok(button(tree, 'Réessayer'));
  assert.match(content(tree), /Service indisponible/);
  assert.doesNotMatch(content(tree), /Aucune recette pour l’instant/);
});

test('promos : les notes restent disponibles après lecture de plusieurs pages de recettes', async () => {
  const s = screen({ listPages: url => {
    const offset = new URLSearchParams(url.split('?')[1]).get('offset');
    return { items: [{ id: recipes[Number(offset)].id }], total: 2 };
  } });
  const tree = await s.load();
  assert.match(content(tree), /Soupe/); assert.match(content(tree), /Salade/);
  assert.equal(s.calls.filter(call => call.url.includes('?')).length, 2);
});
