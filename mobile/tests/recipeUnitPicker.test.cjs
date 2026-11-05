const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function picker(value = null, disabled = false) {
  let open = false, keyboardDismissals = 0;
  const changes = [], exports = {}, form = {};
  const transpile = file => ts.transpileModule(fs.readFileSync(path.join(__dirname, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(transpile('../services/recipeForm.ts'), { exports: form });
  const jsx = (type, props) => ({ type, props: props ?? {} });
  vm.runInNewContext(transpile('../components/RecipeUnitPicker.tsx'), { exports, require: name => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (name === 'react') return { useState: () => [open, value => { open = value; }] };
    if (name === 'react-native') return { View: 'View', Text: 'Text', Pressable: 'Pressable', Modal: 'Modal', ScrollView: 'ScrollView',
      Keyboard: { dismiss() { keyboardDismissals++; } }, StyleSheet: { create: styles => styles, absoluteFillObject: {} } };
    if (name.endsWith('services/recipeForm')) return form;
    if (name === './recipes') return { RecipeButton: 'RecipeButton', recipeColors: {}, recipeStyles: {} };
    return new Proxy({}, { get: (_, key) => String(key) });
  } });
  const render = () => exports.default({ value, disabled, ingredientLabel: 'Farine', onChange: next => { value = next; changes.push(next); } });
  return { render, changes, dismissals: () => keyboardDismissals };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const trigger = p => nodes(p.render()).find(n => n.props.accessibilityRole === 'button');
const modal = p => nodes(p.render()).find(n => n.type === 'Modal');
const options = p => nodes(p.render()).filter(n => n.props.accessibilityRole === 'radio');

test('aucune présélection : ouvrir la liste, masquer le clavier et exposer les six unités', () => {
  const p = picker();
  assert.equal(modal(p), undefined);
  assert.match(trigger(p).props.accessibilityLabel, /aucune unité sélectionnée/);
  trigger(p).props.onPress();
  assert.equal(p.dismissals(), 1);
  assert.equal(trigger(p).props.accessibilityState.expanded, true);
  assert.equal(options(p).length, 6);
  assert.equal(options(p).filter(n => n.props.accessibilityState.checked).length, 0);
  for (const volume of ['250', '15', '5']) {
    assert.ok(options(p).some(n => n.props.accessibilityLabel.includes(`${volume} millilitres`)));
  }
});

test('sélectionner une unité ferme la liste, affiche la valeur et coche le choix à la réouverture', () => {
  const p = picker('g');
  trigger(p).props.onPress();
  options(p).find(n => n.props.accessibilityLabel.includes('table')).props.onPress();
  assert.deepEqual(p.changes, ['tbsp']);
  assert.equal(modal(p), undefined);
  assert.match(trigger(p).props.accessibilityLabel, /15 millilitres/);
  trigger(p).props.onPress();
  const checked = options(p).filter(n => n.props.accessibilityState.checked);
  assert.equal(checked.length, 1);
  assert.match(checked[0].props.accessibilityLabel, /table/);
});

for (const close of ['bouton', 'Android', 'VoiceOver', 'arrière-plan']) {
  test(`fermer par ${close} conserve l’unité sans appeler onChange`, () => {
    const p = picker('cup');
    trigger(p).props.onPress();
    if (close === 'bouton') nodes(p.render()).find(n => n.props.title === 'Fermer').props.onPress();
    if (close === 'Android') modal(p).props.onRequestClose();
    if (close === 'VoiceOver') nodes(p.render()).find(n => n.props.onAccessibilityEscape).props.onAccessibilityEscape();
    if (close === 'arrière-plan') nodes(p.render()).find(n => n.props.focusable === false).props.onPress();
    assert.equal(modal(p), undefined);
    assert.deepEqual(p.changes, []);
    assert.match(trigger(p).props.accessibilityLabel, /250 millilitres/);
  });
}

test('pendant un enregistrement, le sélecteur désactivé ne s’ouvre pas', () => {
  const p = picker('ml', true);
  assert.equal(trigger(p).props.disabled, true);
  trigger(p).props.onPress();
  assert.equal(modal(p), undefined);
  assert.equal(p.dismissals(), 0);
});
