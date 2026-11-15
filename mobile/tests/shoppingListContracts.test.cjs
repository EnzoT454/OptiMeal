const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

test('les exemples Pydantic exportés sont compatibles avec les types mobiles des listes', () => {
  const exported = JSON.parse(fs.readFileSync(path.join(__dirname,
    '../../backend/contracts/v1/shopping-list-examples.json'), 'utf8'));
  assert.equal(exported.status, 'lot_a_implemented');
  const filename = path.join(__dirname, '.shopping-contracts-check.ts');
  const source = `import type { ShoppingContractExamples } from '../types/shoppingLists';\n` +
    `const examples: ShoppingContractExamples = ${JSON.stringify(exported.examples)};\n` +
    'void examples;\n';
  const options = { noEmit: true, strict: true, skipLibCheck: true,
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, types: [] };
  const host = ts.createCompilerHost(options);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (file, ...rest) => file === filename
    ? ts.createSourceFile(file, source, options.target, true)
    : originalGetSourceFile(file, ...rest);
  const program = ts.createProgram([filename], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, diagnostics.map(d =>
    ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'));
});
