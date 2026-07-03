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
  const root = widget.host.shadowRoot;

  widget.showOutline({ top: 10, left: 20, width: 100, height: 30 });
  widget.showStats({ wpm: 12.4, cpm: 62.1, errorRate: 0.05 });

  assert.ok(widget.host.shadowRoot);
  assert.equal(root.querySelector('.te-start-button').getAttribute('aria-label'), '开始打字练习');
  assert.equal(root.querySelector('.te-settings-button').getAttribute('aria-label'), '打开设置');
  assert.equal(root.querySelector('.te-start-button').textContent, '🤓');
  assert.equal(root.querySelector('.te-settings-close'), null);
  assert.match(root.textContent, /12 WPM/);
  assert.match(root.textContent, /62 CPM/);
  assert.match(root.textContent, /5\.0%/);
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
  ], 1);
  const overlay = root.querySelector('.te-typing-layer');
  const chars = [...overlay.querySelectorAll('.te-char')].map((node) => ({
    text: node.textContent,
    state: node.dataset.state,
  }));
  const cursor = overlay.querySelector('.te-cursor');
  assert.equal(document.querySelector('#target').style.visibility, 'hidden');
  assert.deepEqual(chars, [
    { text: '正', state: 'correct' },
    { text: '误', state: 'error' },
    { text: '文', state: 'pending' },
  ]);
  assert.ok(cursor);
  assert.equal(cursor.getAttribute('data-position'), '1');

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
  const root = widget.host.shadowRoot;

  widget.showPrompt('按 Enter 开始');
  const prompt = root.querySelector('.te-prompt');
  assert.equal(prompt.style.display, 'block');
  assert.match(prompt.textContent, /按 Enter 开始/);
  const styleText = root.querySelector('style').textContent;
  assert.match(styleText, /background: #000000;/);
  assert.match(styleText, /color: #03fc0b;/);

  widget.hidePrompt();
  assert.equal(prompt.style.display, 'none');
  assert.equal(prompt.textContent, '');

  widget.showSettings({
    theme: 'Soft',
    icon: {
      type: 'image',
      value: 'data:image/png;base64,abc',
    },
    colors: {
      outline: '#123456',
      pending: '#654321',
      correct: '#102938',
      error: '#abcdef',
      skipped: '#135790',
      errorBackground: '#fedcba',
      statsBackground: '#000000',
      statsText: '#00ff51',
    },
    behavior: {
      followCurrentParagraph: false,
      followCorrectTextColor: true,
    },
  });
  const settings = root.querySelector('.te-settings');
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
  assert.equal(
    settings.querySelector('input[name="followCorrectTextColor"]').checked,
    true,
  );
  assert.equal(
    settings.querySelector('.te-settings-close').getAttribute('aria-label'),
    '关闭设置',
  );
  assert.equal(
    settings.querySelector('input[name="icon-file"]').getAttribute('type'),
    'file',
  );
  assert.equal(settings.querySelector('input[name="color-outline"]').value, '#123456');
  assert.equal(settings.querySelector('input[name="color-skipped"]').value, '#135790');
  assert.equal(settings.querySelector('input[name="color-statsBackground"]').value, '#000000');
  assert.equal(settings.querySelector('input[name="color-statsText"]').value, '#00ff51');
  assert.equal(settings.querySelector('input[name="color-correct"]'), null);
  assert.match(settings.textContent, /跟随原文颜色/);
  assert.match(settings.textContent, /当前段落跟随滚动/);

  widget.hideSettings();
  assert.equal(settings.style.display, 'none');

  widget.applyTheme({
    outline: '#123456',
    pending: '#654321',
    correct: '#102938',
    error: '#abcdef',
    skipped: '#135790',
    errorBackground: '#fedcba',
    statsBackground: '#000000',
    statsText: '#00ff51',
  });

  const styles = root.querySelector('.te-outline').style;
  assert.equal(styles.getPropertyValue('--te-outline-color'), '#123456');
  assert.equal(styles.getPropertyValue('--te-pending-color'), '#654321');
  assert.equal(styles.getPropertyValue('--te-correct-color'), '#102938');
  assert.equal(styles.getPropertyValue('--te-error-color'), '#abcdef');
  assert.equal(styles.getPropertyValue('--te-skipped-color'), '#135790');
  assert.equal(styles.getPropertyValue('--te-error-bg-color'), '#fedcba');
  assert.equal(styles.getPropertyValue('--te-stats-background-color'), '#000000');
  assert.equal(styles.getPropertyValue('--te-stats-text-color'), '#00ff51');

  widget.destroy();
});

test('支持图标展开与闲置收边显示', () => {
  const dom = new JSDOM('<p>正文</p>', {
    pretendToBeVisual: true,
  });
  const { document } = dom.window;
  const widget = createWidget(document);
  const dock = widget.host.shadowRoot.querySelector('.te-dock');

  widget.setExpanded(true);
  assert.equal(dock.dataset.expanded, 'true');

  widget.setExpanded(false);
  assert.equal(dock.dataset.expanded, 'false');

  widget.setIdleCollapsed(true, 'right');
  assert.equal(dock.dataset.collapsed, 'true');
  assert.equal(dock.dataset.edge, 'right');

  widget.setIdleCollapsed(false, 'right');
  assert.equal(dock.dataset.collapsed, 'false');

  widget.setDockEdge('right');
  assert.equal(dock.dataset.edge, 'right');

  widget.destroy();
});

test('支持更新入口图标与垂直吸附布局', () => {
  const dom = new JSDOM('<p>正文</p>', {
    pretendToBeVisual: true,
  });
  const { document } = dom.window;
  const widget = createWidget(document);
  const root = widget.host.shadowRoot;

  widget.setIcon({ type: 'emoji', value: '⌨️' });
  assert.equal(root.querySelector('.te-start-button').textContent, '⌨️');

  widget.setIcon({ type: 'image', value: 'data:image/png;base64,abc' });
  const iconImage = root.querySelector('.te-start-button img');
  assert.ok(iconImage);
  assert.equal(iconImage.getAttribute('src'), 'data:image/png;base64,abc');

  widget.setDockEdge('right');
  assert.equal(root.querySelector('.te-dock').dataset.edge, 'right');

  widget.destroy();
});

test('支持将光标渲染到段尾', () => {
  const dom = new JSDOM('<p id="target">正文</p>', {
    pretendToBeVisual: true,
  });
  const { document } = dom.window;
  const widget = createWidget(document);
  const root = widget.host.shadowRoot;

  document.querySelector('#target').getBoundingClientRect = () => ({
    top: 10,
    left: 20,
    width: 160,
    height: 32,
  });
  widget.showTypingOverlay(document.querySelector('#target'), [
    { text: 'A', state: 'correct' },
    { text: 'B', state: 'correct' },
  ], 2);

  const cursor = root.querySelector('.te-cursor');
  assert.ok(cursor);
  assert.equal(cursor.getAttribute('data-position'), '2');

  widget.destroy();
});

test('下一字符换行时光标跟到下一行', () => {
  const dom = new JSDOM('<p id="target">正文</p>', {
    pretendToBeVisual: true,
  });
  const { document } = dom.window;
  const widget = createWidget(document);
  const root = widget.host.shadowRoot;
  const target = document.querySelector('#target');
  const originalGetBoundingClientRect = dom.window.Element.prototype.getBoundingClientRect;

  dom.window.Element.prototype.getBoundingClientRect = function getRect() {
    if (this === target || this.classList?.contains('te-typing-layer')) {
      return {
        top: 10,
        left: 20,
        width: 160,
        height: 60,
        right: 180,
        bottom: 70,
      };
    }

    if (this.classList?.contains('te-char') && this.dataset.index === '0') {
      return {
        top: 10,
        left: 20,
        right: 30,
        height: 20,
      };
    }

    if (this.classList?.contains('te-char') && this.dataset.index === '1') {
      return {
        top: 34,
        left: 20,
        right: 30,
        height: 20,
      };
    }

    return originalGetBoundingClientRect.call(this);
  };

  try {
    widget.showTypingOverlay(target, [
      { text: 'A', state: 'correct' },
      { text: 'B', state: 'pending' },
    ], 1);

    const cursor = root.querySelector('.te-cursor');
    const capture = root.querySelector('.te-capture');
    assert.equal(cursor.style.left, '0px');
    assert.equal(cursor.style.top, '24px');
    assert.equal(capture.style.left, '20px');
    assert.equal(capture.style.top, '58px');
  } finally {
    dom.window.Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    widget.destroy();
  }
});
