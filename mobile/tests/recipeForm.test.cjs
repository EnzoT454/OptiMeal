const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../services/recipeForm.ts'), 'utf8');
const exportsForTest = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsForTest });
const { parseIngredientQuantity, recipeBadges, recipeUnitLabel } = exportsForTest;

test('tasses et cuillères : conserver les quantités décimales et décrire les volumes', () => {
  for (const unit of ['cup', 'tbsp', 'tsp']) {
    assert.equal(JSON.stringify(parseIngredientQuantity('0,5', unit)), JSON.stringify({ quantity: '0.5', unit }));
    assert.throws(() => parseIngredientQuantity('0', unit));
    assert.throws(() => parseIngredientQuantity('-1', unit));
  }
  assert.equal(recipeUnitLabel('cup'), 'tasse (250 ml)');
  assert.equal(recipeUnitLabel('tbsp'), 'cuillère à table (15 ml)');
  assert.equal(recipeUnitLabel('tsp'), 'cuillère à thé (5 ml)');
});

test('quantité et unité : virgule française et pièces entières', () => {
  assert.equal(JSON.stringify(parseIngredientQuantity(' 12,5 ', 'g')), JSON.stringify({ quantity: '12.5', unit: 'g' }));
  assert.equal(JSON.stringify(parseIngredientQuantity('150', 'ml')), JSON.stringify({ quantity: '150', unit: 'ml' }));
  assert.equal(JSON.stringify(parseIngredientQuantity('2', 'unit')), JSON.stringify({ quantity: '2', unit: 'unit' }));
});
test('refuser les quantités absentes, négatives, nulles, ambiguës et les conversions non prises en charge', () => {
  for (const value of ['', '0', '-1', '1 kg', '1 tasse', '2 g']) assert.throws(() => parseIngredientQuantity(value, 'g'));
  assert.throws(() => parseIngredientQuantity('1.5', 'unit'));
  assert.throws(() => parseIngredientQuantity('2', null));
  assert.throws(() => parseIngredientQuantity('2', 'kg'));
});
test('Rapide suit la durée totale et Économique ne s’invente pas', () => {
  assert.equal(JSON.stringify(recipeBadges({ total_time_minutes: 30, tags: [] })), '["Rapide"]');
  assert.equal(JSON.stringify(recipeBadges({ total_time_minutes: 31, tags: ['Rapide'] })), '[]');
  assert.equal(JSON.stringify(recipeBadges({ total_time_minutes: 45, tags: ['Économique'] })), '["Économique"]');
});
