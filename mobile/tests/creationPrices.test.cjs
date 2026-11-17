const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function fixture() {
  const line = (retailer, product, amount, units = 1) => ({ sale: { product_id: product, raw_source: { retailer, store_id: '1', name: product } }, amount, sale_units: units });
  const need = (id, name, retailer, amount) => ({ item_ids: [id], name, lines: [line(retailer, name, amount)] });
  const rice = need('rice', 'Riz', 'maxi', '6.00'), milk = need('milk', 'Lait', 'metro', '3.00');
  return { fingerprint: 'quoted', scenarios: [
    { scenario: 'maxi', needs: [rice], known_amount: '6.00', complete: true },
    { scenario: 'metro', needs: [need('rice', 'Riz', 'metro', '8.00')], known_amount: '8.00', complete: true },
    { scenario: 'superc', needs: [{ item_ids: ['rice'], name: 'Riz', lines: [] }], known_amount: '0.00', complete: false },
    { scenario: 'cheapest', needs: [rice, milk], known_amount: '9.00', complete: true },
  ], candidates: [
    { item_id: 'rice', item_index: 0, product_id: 'Riz', name: 'Riz', retailer: 'maxi', amount: '6.00', unit_price: '3.00', units: 2, format: '500 g', issue: null },
    { item_id: 'rice', item_index: 0, product_id: 'metro-rice', name: 'Autre riz', retailer: 'metro', amount: '8.00', unit_price: '4.00', units: 2, format: '500 g', issue: null },
    { item_id: 'rice', item_index: 0, product_id: 'unknown', name: 'Riz inconnu', retailer: 'superc', amount: null, unit_price: null, units: null, format: null, issue: 'Prix inconnu' },
    { item_id: 'milk', item_index: 1, product_id: 'Lait', name: 'Lait', retailer: 'metro', amount: '3.00', unit_price: '3.00', units: 1, format: '1 L', issue: null },
  ] };
}
function screen() {
  let cursor = 0, selected = null;
  const slots = [], picks = [], quote = fixture(), exports = {};
  const jsx = (type, props) => ({ type, props: props ?? {} });
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../components/lists/CreationPrices.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require(name) {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react') return { useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, value => { slots[i].value = value; }]; } };
    if (name === 'react-native') return { Text: 'Text', View: 'View', Pressable: 'Pressable' };
    if (name.endsWith('/recipes')) return { RecipeButton: 'Button', recipeStyles: {} };
    throw new Error(name);
  } });
  return { quote, picks, render() { cursor = 0; return exports.default({ quote, selected, disabled: false, onSelect: value => { selected = value; }, onPick: value => picks.push(value) }); } };
}
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
const text = tree => nodes(tree).flatMap(n => [].concat(n.props.children ?? [])).filter(v => typeof v === 'string').join(' ');
const action = (h, label) => nodes(h.render()).find(n => n.props.accessibilityLabel === label);
test('prix : présenter chaque magasin puis Moins cher en dernier, avec les totaux', () => {
  const h = screen(), all = nodes(h.render());
  assert.deepEqual(all.filter(n => n.props.accessibilityLabel?.startsWith('Voir les produits ')).map(n => n.props.accessibilityLabel),
    ['Voir les produits Maxi', 'Voir les produits Metro', 'Voir les produits Super C', 'Voir les produits Moins cher']);
  assert.match(text(h.render()), /6,00/); assert.match(text(h.render()), /9,00/);
  assert.match(text(h.render()), /Prix indisponible/);
});
test('magasin spécifique : afficher ses produits exacts après sélection', () => {
  const h = screen(); action(h, 'Voir les produits Metro').props.onPress();
  assert.ok(action(h, 'Changer le magasin pour Riz'));
  assert.equal(action(h, 'Changer le magasin pour Lait'), undefined);
  assert.match(text(h.render()), /8,00/);
});
test('Moins cher : regrouper les produits par magasin et proposer les alternatives au toucher', () => {
  const h = screen(); action(h, 'Voir les produits Moins cher').props.onPress();
  const headers = nodes(h.render()).filter(n => n.props.accessibilityRole === 'header').map(n => n.props.children.join(''));
  assert.deepEqual(headers, ['Maxi · 1', 'Metro · 1']);
  action(h, 'Changer le magasin pour Riz').props.onPress();
  const buttons = nodes(h.render()).filter(n => n.type === 'Button');
  const other = buttons.find(n => n.props.title.startsWith('Metro · Autre riz'));
  assert.ok(other); other.props.onPress();
  assert.equal(h.picks[0].product_id, 'metro-rice'); assert.equal(h.picks[0].item_index, 0);
});
test('les produits sans prix ne peuvent pas être choisis comme prix connus', () => {
  const h = screen(); action(h, 'Voir les produits Moins cher').props.onPress();
  action(h, 'Changer le magasin pour Riz').props.onPress();
  const unknown = nodes(h.render()).find(n => n.props.title?.startsWith('Super C · Riz inconnu'));
  assert.equal(unknown.props.disabled, true);
});
