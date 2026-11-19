const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const tick = () => new Promise(resolve => setImmediate(resolve));
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
// Vrais services et hooks TypeScript ; stockage et identité sont simulés.
function runtime(options = {}) {
  const data = options.data ?? new Map(), cache = new Map(), writes = [], prompts = [], reads = [];
  let uuid = 0;
  let userId = 'compte-a', hooks;
  const storage = {
    async getAllKeys() { return [...data.keys()]; },
    async multiRemove(keys) { for (const key of keys) data.delete(key); },
    async getItem(key) {
      reads.push(key); if (options.beforeGet) await options.beforeGet(key);
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      if (options.beforeSet) await options.beforeSet(key, value);
      writes.push(key); data.set(key, value);
    },
  };
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const exports = {}; cache.set(relative, exports);
    const source = fs.readFileSync(path.join(__dirname, '../..', relative), 'utf8');
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText, { exports, require(name) {
      if (name === '@react-native-async-storage/async-storage') return { __esModule: true, default: storage };
      if (name === 'react') return hooks;
      if (name === 'expo-crypto') return { randomUUID: () => `local-test-${++uuid}` };
      if (name.endsWith('/AuthContext')) return { useAuth: () => ({
        session: userId ? { user: { id: userId } } : null, requestSignIn: reason => prompts.push(reason),
      }) };
      if (name.endsWith('/api')) return { ApiError, api: options.api ?? (async () => ({ items: [], total: 0 })) };
      if (name.endsWith('/search')) return { isOnPromo: o => options.isOnPromo?.(o) ?? false };
      if (name.startsWith('.')) return load(path.normalize(path.join(path.dirname(relative), name)) + '.ts');
      throw new Error('Unexpected import: ' + name);
    } });
    return exports;
  }
  function hook(relative, exportName) {
    const slots = [], effects = []; let cursor = 0;
    const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
    hooks = {
      useState(initial) {
        const i = cursor++;
        if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
        return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }];
      },
      useRef(initial) { const i = cursor++; if (!slots[i]) slots[i] = { current: initial }; return slots[i]; },
      useCallback(fn, deps) {
        const i = cursor++;
        if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { fn, deps };
        return slots[i].fn;
      },
      useEffect(fn, deps) {
        const i = cursor++;
        if (!slots[i] || !same(slots[i].deps, deps)) {
          const old = slots[i]; slots[i] = { deps };
          effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); });
        }
      },
    };
    const fn = load(relative)[exportName];
    return {
      render(account) { userId = account; cursor = 0; return fn(); },
      flush() { effects.splice(0).forEach(effect => effect()); },
      unmount() { slots.forEach(slot => slot.cleanup?.()); },
      async settled(account) { this.render(account); this.flush(); await tick(); return this.render(account); },
    };
  }
  return { ApiError, data, writes, reads, prompts, load, hook,
    account: value => { userId = value; } };
}

module.exports = { runtime };
