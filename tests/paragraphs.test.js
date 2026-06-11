import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';

import {
  findCandidateFromTarget,
  listParagraphsFrom,
} from '../src/core/paragraphs.js';

test('命中嵌套链接时返回最近的完整语义段落', () => {
  const dom = new JSDOM('<p id="p">阅读 <a id="a">链接文字</a></p><input value="忽略">');
  const { document } = dom.window;

  assert.equal(
    findCandidateFromTarget(document.querySelector('#a')),
    document.querySelector('#p'),
  );
});

test('按 DOM 顺序列出有效段落并保持原 DOM 不变', () => {
  const dom = new JSDOM(
    '<main><h2>标题</h2><p id="start">第一段</p><p hidden>隐藏</p><li>列表项</li></main>',
  );
  const { document } = dom.window;
  const before = document.querySelector('main').innerHTML;

  const result = listParagraphsFrom(document.querySelector('#start'), {
    isVisible: (element) => !element.hidden,
  });

  assert.deepEqual(
    result.map((element) => element.textContent),
    ['第一段', '列表项'],
  );
  assert.equal(document.querySelector('main').innerHTML, before);
});
