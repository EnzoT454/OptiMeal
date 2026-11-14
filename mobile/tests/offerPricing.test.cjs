const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const pricing = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../services/offerPricing.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: pricing });
const oil = { price: { amount: null }, promo_price: { amount: '7.77' },
  promotion: { status: 'active' }, quantity_limit: 4, price_after_limit: '10.00' };

test('huile : prix de la première unité et condition de quantité affichable', () => {
  assert.equal(pricing.currentOfferPrice(oil), '7.77');
  assert.equal(pricing.quantityPriceCondition(oil), 'Limite de 4 unités, puis 10,00 $ par unité');
});

for (const status of ['expired', 'upcoming', 'unverifiable', 'not_promotion']) {
  test(`hors promotion active (${status}) : ne pas utiliser le prix après limite comme prix régulier`, () => {
    const offer = { ...oil, promotion: { status } };
    assert.equal(pricing.currentOfferPrice(offer), null);
    assert.equal(pricing.quantityPriceCondition(offer), null);
    assert.equal(pricing.currentOfferPrice({ ...offer, price: { amount: '12.00' } }), '12.00');
  });
}

test('anciens produits sans condition : compatibilité et aucune limite inventée', () => {
  const offer = { price: { amount: '5.00' }, promo_price: null, promotion: { status: 'not_promotion' } };
  assert.equal(pricing.currentOfferPrice(offer), '5.00');
  assert.equal(pricing.quantityPriceCondition(offer), null);
});

function loadUI(relative) {
  const exports = {};
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const textStyle = new Proxy({}, { get: () => ({}) });
  const source = fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require(name) {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react') return { useState: v => [v, () => {}], useEffect() {} };
    if (name === 'react-native') return { View: 'View', Text: 'Text', Pressable: 'Pressable', Image: 'Image',
      StyleSheet: { create: x => x } };
    if (name.endsWith('/offerPricing')) return pricing;
    if (name.endsWith('/useFollows')) return { useFollows: () => ({ follows: [], busy: false, error: '', toggle() {} }) };
    if (name.endsWith('/promos')) return loadUI('components/promos.ts');
    if (name.endsWith('/deal')) return loadUI('components/deal.ts');
    if (name.endsWith('/api')) return { api() {} };
    if (name.endsWith('/recipes')) return { recipeColors: textStyle, recipeStyles: textStyle,
      RecipeScreen: 'RecipeScreen', RecipeTitle: 'RecipeTitle', RecipeButton: 'RecipeButton' };
    if (name.endsWith('/ProductImage')) return { ProductImage: 'ProductImage' };
    return { __esModule: true, default: name };
  } });
  return exports;
}

function textContent(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (!tree || typeof tree !== 'object') return '';
  if (Array.isArray(tree)) return tree.map(textContent).join(' ');
  return textContent(typeof tree.type === 'function' ? tree.type(tree.props) : tree.props?.children);
}

const displayedOil = { ...oil, product_name: 'Huile d’olive', retailer: 'maxi',
  format: { quantity: '1000', unit_raw: 'ml' }, source: { url: null },
  promotion: { status: 'active', valid_from: '2026-11-12', valid_to: '2026-11-18' } };

for (const name of ['PromoCard', 'PromoTile']) {
  test(`${name} : afficher le prix limité sans faux prix régulier ni pourcentage`, () => {
    const text = textContent(loadUI('components/PromoCard.tsx')[name]({ offer: displayedOil, onPress() {} }));
    assert.match(text, /7,77/);
    assert.match(text, /Limite de 4 unités, puis 10,00/);
    assert.match(text, /En promotion/);
    assert.doesNotMatch(text, /Prix régulier|Économisez|%|—/);
  });
}

test('détail : prix limité et dates, sans inventer un prix régulier', () => {
  const text = textContent(loadUI('app/PromoDetailScreen.tsx').default({
    navigation: { goBack() {} }, route: { params: { offer: displayedOil } },
  }));
  assert.match(text, /7,77/);
  assert.match(text, /Limite de 4 unités, puis 10,00/);
  assert.match(text, /12 novembre au 18 novembre/);
  assert.doesNotMatch(text, /Prix régulier|Économisez|%/);
});
