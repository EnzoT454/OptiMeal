// Tester le service avec des doubles natifs, sans galerie ni compte réel.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

function setup({ canceled = false, size = 100, session = true, status = 200 } = {}) {
  const calls = { uploads: [], resizes: [], saves: [], releases: 0 };
  const rendered = {
    saveAsync: async options => { calls.saves.push(options); return { uri: 'file:///compressed.jpg' }; },
    release: () => calls.releases++,
  };
  const context = { resize: value => calls.resizes.push(value), renderAsync: async () => rendered, release: () => calls.releases++ };
  const bucket = { getPublicUrl: key => ({ data: { publicUrl: `https://project.test/${key}` } }) };
  const modules = {
    'expo-file-system': { File: class { size = size; async arrayBuffer() { return new ArrayBuffer(size); } } },
    'expo-image-picker': { launchImageLibraryAsync: async () => ({ canceled, assets: [{ uri: 'file:///original.heic', width: 4000, height: 3000 }] }) },
    'expo-image-manipulator': { ImageManipulator: { manipulate: () => context }, SaveFormat: { JPEG: 'jpeg' } },
    './supabase': { supabase: {
      auth: { getSession: async () => ({ data: { session: session ? { user: { id: 'alice' }, access_token: 'token' } : null }, error: null }) },
      storage: { from: () => bucket },
    } },
  };
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../services/recipeImages.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, {
    exports, require: name => { assert.ok(name in modules, name); return modules[name]; },
    process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://project.test', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-key' } },
    setTimeout, clearTimeout, AbortController,
    fetch: async (url, options) => { calls.uploads.push({ url, options }); return { ok: status === 200 }; },
  });
  return { ...exports, calls };
}

test('annuler la galerie ne prépare ni n’envoie de photo', async () => {
  const service = setup({ canceled: true });
  assert.equal(await service.chooseRecipeImage(), null);
  assert.equal(service.calls.saves.length, 0);
  assert.equal(service.calls.uploads.length, 0);
});
test('réduire une grande photo et la convertir en JPEG avant tout envoi', async () => {
  const service = setup();
  assert.equal(await service.chooseRecipeImage(), 'file:///compressed.jpg');
  assert.equal(service.calls.resizes[0].width, 1200);
  assert.equal(service.calls.saves[0].format, 'jpeg');
  assert.equal(service.calls.releases, 2);
  assert.equal(service.calls.uploads.length, 0);
});
test('refuser une photo trop volumineuse après compression', async () => {
  const service = setup({ size: 6 * 1024 * 1024 });
  await assert.rejects(service.chooseRecipeImage(), /volumineuse/);
  assert.equal(service.calls.releases, 2);
});
test('envoyer les octets avec le jeton dans le dossier du propriétaire', async () => {
  const service = setup();
  const url = await service.uploadRecipeImage('file:///compressed.jpg');
  const request = service.calls.uploads[0];
  assert.match(request.url, /^https:\/\/project.test\/storage\/v1\/object\/recipes-images\/users\/alice\/.+\.jpg$/);
  assert.equal(request.options.headers.Authorization, 'Bearer token');
  assert.equal(request.options.headers['Content-Type'], 'image/jpeg');
  assert.equal(request.options.headers['x-upsert'], 'false');
  assert.equal(request.options.body.byteLength, 100);
  assert.match(url, /^https:\/\/project.test\/users\/alice\//);
});
test('refuser un envoi sans session', async () => {
  const service = setup({ session: false });
  await assert.rejects(service.uploadRecipeImage('file:///photo.jpg'), /Reconnecte/);
  assert.equal(service.calls.uploads.length, 0);
});
test('refuser une photo vide avant tout appel réseau', async () => {
  const service = setup({ size: 0 });
  await assert.rejects(service.uploadRecipeImage('file:///photo.jpg'), /vide/);
  assert.equal(service.calls.uploads.length, 0);
});
test('signaler un refus Storage sans fournir une URL à enregistrer', async () => {
  const service = setup({ status: 403 });
  await assert.rejects(service.uploadRecipeImage('file:///photo.jpg'), /Envoi de la photo impossible/);
});
