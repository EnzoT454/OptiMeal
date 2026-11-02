const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

for (const failure of ['none', 'returned', 'thrown']) {
  test(`après suppression distante, retirer la session même si signOut échoue : ${failure}`, async () => {
    const calls = [], exports = {};
    const supabase = { auth: {
      async stopAutoRefresh() { calls.push('stop'); },
      async signOut(options) {
        assert.equal(options.scope, 'local'); calls.push('signOut');
        if (failure === 'thrown') throw new Error('Network unavailable');
        return { error: failure === 'returned' ? new Error('Account removed') : null };
      },
    } };
    const source = fs.readFileSync(path.join(__dirname, '../services/supabase.ts'), 'utf8');
    const requireMock = name => {
      if (name === 'react-native-url-polyfill/auto') return {};
      if (name === '@react-native-async-storage/async-storage') return { __esModule: true,
        default: { async multiRemove(keys) { calls.push(Array.from(keys)); } } };
      if (name === '@supabase/supabase-js') return { createClient(_url, _key, options) {
        assert.equal(options.auth.storageKey, 'sb-test-auth-token');
        return supabase;
      } };
      throw new Error('Unexpected import: ' + name);
    };
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
      { exports, require: requireMock, URL, process: { env: {
        EXPO_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_TEST',
      } } });
    await exports.clearDeletedAccountSession();
    assert.deepEqual(calls, ['stop', 'signOut', ['sb-test-auth-token', 'sb-test-auth-token-code-verifier', 'sb-test-auth-token-user']]);
  });
}
