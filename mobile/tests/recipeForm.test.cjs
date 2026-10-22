const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../services/recipeForm.ts'), 'utf8');
const exportsForTest = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsForTest });
const { parseQuantityUnit, recipeBadges } = exportsForTest;

test('quantité et unité : virgule française et pièces entières', () => {
  assert.equal(JSON.stringify(parseQuantityUnit(' 12,5 g ')), JSON.stringify({ quantity: '12.5', unit: 'g' }));
  assert.equal(JSON.stringify(parseQuantityUnit('150 ml')), JSON.stringify({ quantity: '150', unit: 'ml' }));
  assert.equal(JSON.stringify(parseQuantityUnit('2 pièces')), JSON.stringify({ quantity: '2', unit: 'unit' }));
});
test('refuser les quantités absentes, négatives, nulles, ambiguës et les conversions non prises en charge', () => {
  for (const value of ['', '0 g', '-1 g', '1 kg', '1 tasse', '2', '1.5 unit']) assert.throws(() => parseQuantityUnit(value));
});
test('Rapide suit la durée totale et Économique ne s’invente pas', () => {
  assert.equal(JSON.stringify(recipeBadges({ total_time_minutes: 30, tags: [] })), '["Rapide"]');
  assert.equal(JSON.stringify(recipeBadges({ total_time_minutes: 31, tags: ['Rapide'] })), '[]');
  assert.equal(JSON.stringify(recipeBadges({ total_time_minutes: 45, tags: ['Économique'] })), '["Économique"]');
});
