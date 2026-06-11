import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';

import { createWidget } from '../src/ui/widget.js';

test('UI 隔离在 Shadow DOM 且目标正文保持不变', () => {
  const dom = new JSDOM('<p id="target"><a href="#">正文</a></p>', {
    pretendToBeVisual: true,
  });
  const { document } = dom.window;
  const before = document.querySelector('#target').innerHTML;
  const widget = createWidget(document);

  widget.showOutline({ top: 10, left: 20, width: 100, height: 30 });
  widget.showStats({ wpm: 12.4, cpm: 62.1, errorRate: 0.05 });

  assert.ok(widget.host.shadowRoot);
  assert.match(widget.host.shadowRoot.textContent, /12 WPM/);
  assert.match(widget.host.shadowRoot.textContent, /62 CPM/);
  assert.match(widget.host.shadowRoot.textContent, /5\.0%/);
  assert.equal(document.querySelector('#target').innerHTML, before);

  widget.destroy();
  assert.equal(document.querySelector('[data-typing-everywhere-ui]'), null);
});
