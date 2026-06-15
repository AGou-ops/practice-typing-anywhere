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

  document.querySelector('#target').getBoundingClientRect = () => ({
    top: 10,
    left: 20,
    width: 160,
    height: 32,
  });
  widget.showTypingOverlay(document.querySelector('#target'), [
    { text: '正', state: 'correct' },
    { text: '误', state: 'error' },
    { text: '文', state: 'pending' },
  ]);
  const overlay = widget.host.shadowRoot.querySelector('.te-typing-layer');
  const chars = [...overlay.querySelectorAll('.te-char')].map((node) => ({
    text: node.textContent,
    state: node.dataset.state,
  }));
  assert.equal(document.querySelector('#target').style.visibility, 'hidden');
  assert.deepEqual(chars, [
    { text: '正', state: 'correct' },
    { text: '误', state: 'error' },
    { text: '文', state: 'pending' },
  ]);

  widget.hideTypingOverlay();
  assert.equal(document.querySelector('#target').style.visibility, '');

  widget.destroy();
  assert.equal(document.querySelector('[data-typing-everywhere-ui]'), null);
});

test('支持中央提示层、设置面板基础结构与主题应用', () => {
  const dom = new JSDOM('<p id="target">正文</p>', {
    pretendToBeVisual: true,
  });
  const { document } = dom.window;
  const widget = createWidget(document);

  widget.showPrompt('按 Enter 开始');
  const prompt = widget.host.shadowRoot.querySelector('.te-prompt');
  assert.equal(prompt.style.display, 'block');
  assert.match(prompt.textContent, /按 Enter 开始/);

  widget.hidePrompt();
  assert.equal(prompt.style.display, 'none');
  assert.equal(prompt.textContent, '');

  widget.showSettings({
    theme: 'Soft',
    behavior: { followCurrentParagraph: false },
  });
  const settings = widget.host.shadowRoot.querySelector('.te-settings');
  assert.equal(settings.style.display, 'block');

  const presets = [
    ...settings.querySelectorAll('input[name="te-theme-preset"]'),
  ].map((input) => input.value);
  assert.deepEqual(presets, ['Classic', 'Soft', 'HighContrast']);

  const followCurrentParagraph = settings.querySelector(
    'input[name="followCurrentParagraph"]',
  );
  assert.equal(followCurrentParagraph.checked, false);
  assert.equal(
    settings.querySelector('input[value="Soft"]').checked,
    true,
  );

  widget.hideSettings();
  assert.equal(settings.style.display, 'none');

  widget.applyTheme({
    outline: '#123456',
    pending: '#654321',
    correct: '#102938',
    error: '#abcdef',
    errorBackground: '#fedcba',
  });

  const styles = widget.host.shadowRoot.querySelector('.te-outline').style;
  assert.equal(styles.getPropertyValue('--te-outline-color'), '#123456');
  assert.equal(styles.getPropertyValue('--te-pending-color'), '#654321');
  assert.equal(styles.getPropertyValue('--te-correct-color'), '#102938');
  assert.equal(styles.getPropertyValue('--te-error-color'), '#abcdef');
  assert.equal(styles.getPropertyValue('--te-error-bg-color'), '#fedcba');

  widget.destroy();
});
