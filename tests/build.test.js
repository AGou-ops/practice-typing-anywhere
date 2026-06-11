import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('构建产物包含 userscript 元数据且不包含 ESM 导入', async () => {
  const output = await readFile('dist/typing-everywhere.user.js', 'utf8');

  assert.match(output, /^\/\/ ==UserScript==/);
  assert.match(output, /@match\s+\*:\/\/\*\/\*/);
  assert.match(output, /@run-at\s+document-idle/);
  assert.doesNotMatch(output, /^\s*import\s/m);
});
