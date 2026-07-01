import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';

import { createTypingApp } from '../src/app.js';

function dispatchPointer(target, type, values) {
  const view = target.ownerDocument?.defaultView ?? target.defaultView;
  const event = new view.Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, values);
  target.dispatchEvent(event);
}

test('选择段落、接收 IME、自动切段并用 Esc 清理模式 UI', () => {
  const dom = new JSDOM('<p id="one">中文</p><p id="two">AB</p>', {
    url: 'https://example.com',
    pretendToBeVisual: true,
  });
  const { document, KeyboardEvent, CompositionEvent } = dom.window;
  const original = document.body.innerHTML;
  const app = createTypingApp({
    document,
    now: () => 60_000,
    isVisible: () => true,
    scrollIntoView: () => {},
  });

  app.enterSelectionMode();
  app.selectParagraph(document.querySelector('#one'));
  app.capture.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  app.capture.value = '中文';
  app.capture.dispatchEvent(new CompositionEvent('compositionend', {
    data: '中文',
    bubbles: true,
  }));

  assert.equal(app.getSnapshot().paragraphIndex, 1);
  assert.equal(document.querySelector('#one').textContent, '中文');

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(app.getMode(), 'idle');
  assert.equal(document.body.innerHTML, original);

  app.destroy();
});

test('错误输入继续前进且不写入页面表单', () => {
  const dom = new JSDOM('<p id="p">AB</p><input id="page">', {
    url: 'https://example.com',
    pretendToBeVisual: true,
  });
  const { document, InputEvent } = dom.window;
  const app = createTypingApp({
    document,
    now: () => 1_000,
    isVisible: () => true,
  });

  app.selectParagraph(document.querySelector('#p'));
  app.capture.dispatchEvent(new InputEvent('beforeinput', {
    inputType: 'insertText',
    data: 'X',
    bubbles: true,
    cancelable: true,
  }));

  assert.equal(app.getSnapshot().characterIndex, 1);
  assert.equal(app.getSnapshot().errorCount, 1);
  assert.equal(document.querySelector('#page').value, '');
  const chars = [
    ...document
      .querySelector('[data-typing-everywhere-ui]')
      .shadowRoot.querySelectorAll('.te-char'),
  ].map((node) => ({ text: node.textContent, state: node.dataset.state }));
  assert.deepEqual(chars, [
    { text: 'X', state: 'error' },
    { text: 'B', state: 'pending' },
  ]);

  app.destroy();
});

test('默认已输入颜色跟随原文颜色', () => {
  const dom = new JSDOM('<p id="p" style="color: rgb(12, 34, 56)">AB</p>', {
    url: 'https://example.com',
    pretendToBeVisual: true,
  });
  const { document, InputEvent } = dom.window;
  const app = createTypingApp({
    document,
    now: () => 1_000,
    isVisible: () => true,
  });

  app.selectParagraph(document.querySelector('#p'));
  app.capture.dispatchEvent(new InputEvent('beforeinput', {
    inputType: 'insertText',
    data: 'A',
    bubbles: true,
    cancelable: true,
  }));

  const root = document.querySelector('[data-typing-everywhere-ui]').shadowRoot;
  assert.equal(
    root.querySelector('.te-typing-layer').style.getPropertyValue('--te-correct-color'),
    'currentColor',
  );

  app.destroy();
});

test('初始化时统计弹窗默认隐藏', () => {
  const dom = new JSDOM('<p>正文</p>', {
    url: 'https://example.com',
    pretendToBeVisual: true,
  });
  const { document } = dom.window;
  const app = createTypingApp({
    document,
    isVisible: () => true,
  });
  const root = document.querySelector('[data-typing-everywhere-ui]').shadowRoot;

  assert.equal(root.querySelector('.te-stats').style.display, 'none');
  assert.equal(
    root.querySelector('.te-stats').style.getPropertyValue('--te-stats-background-color'),
    '#000000',
  );
  assert.equal(
    root.querySelector('.te-stats').style.getPropertyValue('--te-stats-text-color'),
    '#00ff51',
  );

  app.destroy();
});

test('iframe 文档内不会创建入口图标', () => {
  const dom = new JSDOM('<iframe></iframe>', {
    url: 'https://example.com',
    pretendToBeVisual: true,
  });
  const iframeDocument = dom.window.document.querySelector('iframe').contentDocument;
  const app = createTypingApp({
    document: iframeDocument,
    isVisible: () => true,
  });

  assert.equal(iframeDocument.querySelector('[data-typing-everywhere-ui]'), null);

  app.destroy();
});

test('同一文档重复初始化只保留一个入口图标', () => {
  const dom = new JSDOM('<p>正文</p>', {
    url: 'https://example.com',
    pretendToBeVisual: true,
  });
  const { document } = dom.window;
  const app = createTypingApp({
    document,
    isVisible: () => true,
  });
  const duplicate = createTypingApp({
    document,
    isVisible: () => true,
  });

  assert.equal(document.querySelectorAll('[data-typing-everywhere-ui]').length, 1);

  duplicate.destroy();
  app.destroy();
});

test('拖动图标后持久化位置且不进入选段模式', () => {
  const dom = new JSDOM('<p>正文</p>', {
    url: 'https://example.com',
    pretendToBeVisual: true,
  });
  const { document } = dom.window;
  const app = createTypingApp({
    document,
    isVisible: () => true,
  });
  const button = document
    .querySelector('[data-typing-everywhere-ui]')
    .shadowRoot.querySelector('.te-start-button');

  dispatchPointer(button, 'pointerdown', { pointerId: 1, clientX: 20, clientY: 20 });
  dispatchPointer(document, 'pointermove', { pointerId: 1, clientX: 300, clientY: 200 });
  dispatchPointer(document, 'pointerup', { pointerId: 1, clientX: 300, clientY: 200 });

  assert.equal(app.getMode(), 'idle');
  assert.match(dom.window.localStorage.getItem('typing-everywhere-position'), /xRatio/);

  app.destroy();
});

test('选段点击被取消且链接 DOM 保持不变', () => {
  const dom = new JSDOM('<p id="p">正文 <a id="link" href="/next">链接</a></p>', {
    url: 'https://example.com',
    pretendToBeVisual: true,
  });
  const { document, MouseEvent } = dom.window;
  const app = createTypingApp({
    document,
    isVisible: () => true,
  });
  const paragraph = document.querySelector('#p');
  const before = paragraph.outerHTML;

  app.enterSelectionMode();
  const allowed = document.querySelector('#link').dispatchEvent(new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
  }));

  assert.equal(allowed, false);
  assert.equal(paragraph.innerHTML, '正文 <a id="link" href="/next">链接</a>');
  assert.notEqual(paragraph.outerHTML, before);
  assert.equal(paragraph.style.visibility, 'hidden');
  assert.equal(app.getMode(), 'typing');

  app.destroy();
  assert.equal(paragraph.outerHTML, before);
});

test('退出后恢复段落可见性和原始 DOM 外观', () => {
  const dom = new JSDOM('<p id="p">AB</p>', {
    url: 'https://example.com',
    pretendToBeVisual: true,
  });
  const { document, KeyboardEvent } = dom.window;
  const app = createTypingApp({
    document,
    isVisible: () => true,
  });
  const paragraph = document.querySelector('#p');
  const before = paragraph.outerHTML;

  app.selectParagraph(paragraph);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  assert.equal(paragraph.outerHTML, before);
  app.destroy();
});

test('destroy 撤销监听并移除全部脚本 UI', () => {
  const dom = new JSDOM('<p>正文</p>', {
    url: 'https://example.com',
    pretendToBeVisual: true,
  });
  const { document, KeyboardEvent } = dom.window;
  const app = createTypingApp({
    document,
    isVisible: () => true,
  });

  app.enterSelectionMode();
  app.destroy();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  assert.equal(document.querySelector('[data-typing-everywhere-ui]'), null);
});

test('无效持久化位置会被清理且空选择不会进入打字模式', () => {
  const dom = new JSDOM('<div id="root">普通内容</div>', {
    url: 'https://example.com',
    pretendToBeVisual: true,
  });
  const { document } = dom.window;
  dom.window.localStorage.setItem('typing-everywhere-position', '{bad json');

  const app = createTypingApp({
    document,
    isVisible: () => true,
  });

  assert.equal(dom.window.localStorage.getItem('typing-everywhere-position'), null);
  app.selectParagraph(document.querySelector('#root'));
  assert.equal(app.getMode(), 'idle');

  app.destroy();
});

test('选段悬停和空白点击保持只读，非 typing 输入不会推进', () => {
  const dom = new JSDOM('<p id="p">第一段</p><div id="blank"></div>', {
    url: 'https://example.com',
    pretendToBeVisual: true,
  });
  const { document, MouseEvent, InputEvent } = dom.window;
  const app = createTypingApp({
    document,
    isVisible: () => true,
  });
  const root = document.querySelector('[data-typing-everywhere-ui]').shadowRoot;

  app.enterSelectionMode();
  document.querySelector('#p').getBoundingClientRect = () => ({
    top: 1,
    left: 2,
    width: 3,
    height: 4,
  });

  document.querySelector('#p').dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));
  assert.equal(root.querySelector('.te-outline').style.display, 'block');

  document.querySelector('#blank').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(app.getMode(), 'selecting');

  app.capture.dispatchEvent(new InputEvent('beforeinput', {
    inputType: 'insertText',
    data: 'X',
    bubbles: true,
    cancelable: true,
  }));
  assert.equal(app.getSnapshot(), null);

  app.destroy();
});

test('组合输入期间忽略中间 beforeinput，删除输入会回退当前位置', () => {
  const dom = new JSDOM('<p id="p">AB</p>', {
    url: 'https://example.com',
    pretendToBeVisual: true,
  });
  const { document, CompositionEvent, InputEvent } = dom.window;
  const app = createTypingApp({
    document,
    now: () => 2_000,
    isVisible: () => true,
  });

  app.selectParagraph(document.querySelector('#p'));
  app.capture.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  app.capture.dispatchEvent(new InputEvent('beforeinput', {
    inputType: 'insertText',
    data: 'A',
    bubbles: true,
    cancelable: true,
  }));
  assert.equal(app.getSnapshot().typedCount, 0);

  app.capture.dispatchEvent(new CompositionEvent('compositionend', {
    data: 'A',
    bubbles: true,
  }));
  assert.equal(app.getSnapshot().characterIndex, 1);
  assert.deepEqual(
    [
      ...document
        .querySelector('[data-typing-everywhere-ui]')
        .shadowRoot.querySelectorAll('.te-char'),
    ].map((node) => ({ text: node.textContent, state: node.dataset.state })),
    [
      { text: 'A', state: 'correct' },
      { text: 'B', state: 'pending' },
    ],
  );

  app.capture.dispatchEvent(new InputEvent('beforeinput', {
    inputType: 'deleteContentBackward',
    bubbles: true,
    cancelable: true,
  }));
  assert.equal(app.getSnapshot().characterIndex, 0);
  assert.deepEqual(
    [
      ...document
        .querySelector('[data-typing-everywhere-ui]')
        .shadowRoot.querySelectorAll('.te-char'),
    ].map((node) => ({ text: node.textContent, state: node.dataset.state })),
    [
      { text: 'A', state: 'pending' },
      { text: 'B', state: 'pending' },
    ],
  );

  app.destroy();
});

test('默认滚动和 DOM 新增段落会继续练习队列', async () => {
  const dom = new JSDOM('<p id="first">A</p>', {
    url: 'https://example.com',
    pretendToBeVisual: true,
  });
  const { document, CompositionEvent } = dom.window;
  let scrollCalls = 0;
  dom.window.Element.prototype.scrollIntoView = () => {
    scrollCalls += 1;
  };

  const app = createTypingApp({
    document,
    now: () => 3_000,
    isVisible: () => true,
  });

  app.selectParagraph(document.querySelector('#first'));
  app.capture.dispatchEvent(new CompositionEvent('compositionend', {
    data: 'A',
    bubbles: true,
  }));
  assert.equal(app.getSnapshot().done, true);

  const next = document.createElement('p');
  next.textContent = 'B';
  document.body.append(next);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(app.getSnapshot().done, false);
  assert.equal(scrollCalls > 0, true);

  app.destroy();
});

test('点击图标不拖动时进入选段模式，错误 pointerup 不影响状态', () => {
  const dom = new JSDOM('<p>正文</p>', {
    url: 'https://example.com',
    pretendToBeVisual: true,
  });
  const { document } = dom.window;
  const app = createTypingApp({
    document,
    isVisible: () => true,
  });
  const button = document
    .querySelector('[data-typing-everywhere-ui]')
    .shadowRoot.querySelector('.te-start-button');

  dispatchPointer(document, 'pointerup', { pointerId: 9, clientX: 1, clientY: 1 });
  assert.equal(app.getMode(), 'idle');

  dispatchPointer(button, 'pointerdown', { pointerId: 1, clientX: 20, clientY: 20 });
  dispatchPointer(document, 'pointermove', { pointerId: 1, clientX: 22, clientY: 22 });
  dispatchPointer(document, 'pointerup', { pointerId: 1, clientX: 22, clientY: 22 });
  assert.equal(app.getMode(), 'selecting');

  app.destroy();
});

test('进入选段模式显示中央提示并可用 Esc 退出', () => {
  const dom = new JSDOM('<p>正文</p>', {
    url: 'https://example.com',
    pretendToBeVisual: true,
  });
  const { document, KeyboardEvent } = dom.window;
  const app = createTypingApp({
    document,
    isVisible: () => true,
  });
  const root = document.querySelector('[data-typing-everywhere-ui]').shadowRoot;

  app.enterSelectionMode();
  assert.equal(root.querySelector('.te-prompt').style.display, 'block');
  assert.match(root.querySelector('.te-prompt').textContent, /请选择一段文本/);

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(app.getMode(), 'idle');
  assert.equal(root.querySelector('.te-prompt').style.display, 'none');

  app.destroy();
});

test('Tab 跳过字符、Shift+Tab 预览跳段且统计按时间刷新', () => {
  const dom = new JSDOM('<p id="one">AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA</p><p id="two">下一段</p>', {
    url: 'https://example.com',
    pretendToBeVisual: true,
  });
  const { document, KeyboardEvent, InputEvent } = dom.window;
  let nowValue = 1_000;
  let intervalTask = null;
  let timeoutTask = null;

  const app = createTypingApp({
    document,
    now: () => nowValue,
    isVisible: () => true,
    scrollIntoView: () => {},
    setIntervalFn: (callback, delay) => {
      intervalTask = { callback, delay };
      return 1;
    },
    clearIntervalFn: () => {
      intervalTask = null;
    },
    setTimeoutFn: (callback, delay) => {
      timeoutTask = { callback, delay };
      return 2;
    },
    clearTimeoutFn: () => {
      timeoutTask = null;
    },
  });
  const root = document.querySelector('[data-typing-everywhere-ui]').shadowRoot;

  app.selectParagraph(document.querySelector('#one'));
  assert.equal(root.querySelector('.te-cursor').getAttribute('data-position'), '0');
  const tabAllowed = document.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Tab',
    bubbles: true,
    cancelable: true,
  }));
  assert.equal(tabAllowed, false);
  assert.deepEqual(
    [...root.querySelectorAll('.te-char')].slice(0, 2).map((node) => ({
      text: node.textContent,
      state: node.dataset.state,
    })),
    [
      { text: 'A', state: 'skipped' },
      { text: 'A', state: 'pending' },
    ],
  );
  assert.equal(root.querySelector('.te-cursor').getAttribute('data-position'), '1');

  app.capture.dispatchEvent(new InputEvent('beforeinput', {
    inputType: 'insertText',
    data: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    bubbles: true,
    cancelable: true,
  }));
  assert.equal(intervalTask.delay, 250);

  nowValue = 61_000;
  intervalTask.callback();
  assert.match(root.querySelector('.te-stats').textContent, /01:00/);
  assert.match(root.querySelector('.te-stats').textContent, /10 WPM {2}49 CPM/);

  const shiftTabAllowed = document.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  }));
  assert.equal(shiftTabAllowed, false);
  assert.equal(timeoutTask.delay, 600);
  assert.deepEqual(
    [...root.querySelectorAll('.te-char')].slice(0, 3).map((node) => ({
      text: node.textContent,
      state: node.dataset.state,
    })),
    [
      { text: '下', state: 'skipped' },
      { text: '一', state: 'skipped' },
      { text: '段', state: 'skipped' },
    ],
  );

  timeoutTask.callback();
  assert.equal(app.getSnapshot().done, true);

  app.destroy();
});

test('打字模式下统计弹窗可拖动并持久化位置', () => {
  const dom = new JSDOM('<p id="p">AB</p>', {
    url: 'https://example.com',
    pretendToBeVisual: true,
  });
  const { document } = dom.window;
  const app = createTypingApp({
    document,
    isVisible: () => true,
  });
  const root = document.querySelector('[data-typing-everywhere-ui]').shadowRoot;
  const stats = root.querySelector('.te-stats');

  app.selectParagraph(document.querySelector('#p'));
  stats.getBoundingClientRect = () => ({
    left: 100,
    top: 200,
    width: 180,
    height: 40,
    right: 280,
    bottom: 240,
  });

  dispatchPointer(stats, 'pointerdown', {
    pointerId: 7,
    clientX: 120,
    clientY: 215,
    button: 0,
  });
  dispatchPointer(document, 'pointermove', {
    pointerId: 7,
    clientX: 260,
    clientY: 320,
  });
  dispatchPointer(document, 'pointerup', {
    pointerId: 7,
    clientX: 260,
    clientY: 320,
  });

  assert.equal(stats.style.left, '240px');
  assert.equal(stats.style.top, '305px');
  const saved = JSON.parse(dom.window.localStorage.getItem('typing-everywhere-stats-position'));
  assert.ok(saved.xRatio > 0);
  assert.ok(saved.yRatio > 0);

  app.destroy();

  const app2 = createTypingApp({
    document,
    isVisible: () => true,
  });
  const root2 = document.querySelector('[data-typing-everywhere-ui]').shadowRoot;
  const stats2 = root2.querySelector('.te-stats');
  assert.equal(stats2.style.left, '240px');
  assert.equal(stats2.style.top, '305px');

  app2.destroy();
});

test('打字模式下屏蔽其他快捷键和打字区域外按键', () => {
  const dom = new JSDOM('<p id="p">AB</p><input id="outside">', {
    url: 'https://example.com',
    pretendToBeVisual: true,
  });
  const { document, KeyboardEvent } = dom.window;
  const app = createTypingApp({
    document,
    isVisible: () => true,
  });
  const root = document.querySelector('[data-typing-everywhere-ui]').shadowRoot;

  app.selectParagraph(document.querySelector('#p'));

  const ctrlAllowed = document.dispatchEvent(new KeyboardEvent('keydown', {
    key: 's',
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  }));
  assert.equal(ctrlAllowed, false);
  assert.equal(app.getSnapshot().typedCount, 0);

  document.querySelector('#outside').focus();
  const outsideAllowed = document.querySelector('#outside').dispatchEvent(new KeyboardEvent('keydown', {
    key: 'a',
    bubbles: true,
    cancelable: true,
  }));
  assert.equal(outsideAllowed, false);
  assert.equal(root.activeElement, root.querySelector('.te-capture'));

  const escapeAllowed = document.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  }));
  assert.equal(escapeAllowed, false);
  assert.equal(app.getMode(), 'idle');

  app.destroy();
});

test('设置变更会持久化主题与跟随开关，闲置五分钟后图标收边，右键不会拖动', () => {
  const dom = new JSDOM('<p>正文</p>', {
    url: 'https://example.com',
    pretendToBeVisual: true,
  });
  const { document, Event, MouseEvent } = dom.window;
  let nowValue = 10_000;
  let intervalTask = null;

  const app = createTypingApp({
    document,
    now: () => nowValue,
    isVisible: () => true,
    setIntervalFn: (callback, delay) => {
      intervalTask = { callback, delay };
      return 1;
    },
    clearIntervalFn: () => {
      intervalTask = null;
    },
  });
  const root = document.querySelector('[data-typing-everywhere-ui]').shadowRoot;
  const settingsButton = root.querySelector('.te-settings-button');
  const startButton = root.querySelector('.te-start-button');
  const dock = root.querySelector('.te-dock');

  const contextAllowed = settingsButton.dispatchEvent(new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
  }));
  assert.equal(contextAllowed, false);

  dispatchPointer(startButton, 'pointerdown', {
    pointerId: 3,
    clientX: 20,
    clientY: 20,
    button: 2,
  });
  dispatchPointer(document, 'pointermove', { pointerId: 3, clientX: 200, clientY: 200 });
  dispatchPointer(document, 'pointerup', { pointerId: 3, clientX: 200, clientY: 200 });
  assert.equal(app.getMode(), 'idle');

  settingsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  assert.equal(root.querySelector('.te-settings').style.display, 'block');
  const outlineInput = root.querySelector('input[name="color-outline"]');
  outlineInput.value = '#223344';
  outlineInput.dispatchEvent(new Event('input', { bubbles: true }));
  const statsBackgroundInput = root.querySelector('input[name="color-statsBackground"]');
  statsBackgroundInput.value = '#111111';
  statsBackgroundInput.dispatchEvent(new Event('input', { bubbles: true }));
  const statsTextInput = root.querySelector('input[name="color-statsText"]');
  statsTextInput.value = '#22ff66';
  statsTextInput.dispatchEvent(new Event('input', { bubbles: true }));

  const followInput = root.querySelector('input[name="followCurrentParagraph"]');
  followInput.checked = false;
  followInput.dispatchEvent(new Event('change', { bubbles: true }));

  const followCorrectInput = root.querySelector('input[name="followCorrectTextColor"]');
  followCorrectInput.checked = false;
  followCorrectInput.dispatchEvent(new Event('change', { bubbles: true }));

  const saved = JSON.parse(dom.window.localStorage.getItem('typing-everywhere-config'));
  assert.equal(saved.colors.outline, '#223344');
  assert.equal(saved.colors.statsBackground, '#111111');
  assert.equal(saved.colors.statsText, '#22ff66');
  assert.equal(saved.behavior.followCurrentParagraph, false);
  assert.equal(saved.behavior.followCorrectTextColor, false);
  assert.equal(
    root.querySelector('.te-outline').style.getPropertyValue('--te-outline-color'),
    '#223344',
  );
  assert.equal(
    root.querySelector('.te-stats').style.getPropertyValue('--te-stats-background-color'),
    '#111111',
  );
  assert.equal(
    root.querySelector('.te-stats').style.getPropertyValue('--te-stats-text-color'),
    '#22ff66',
  );

  root.querySelector('.te-settings-close').dispatchEvent(new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
  }));
  assert.equal(root.querySelector('.te-settings').style.display, 'none');

  nowValue += 301_000;
  intervalTask.callback();
  assert.equal(dock.dataset.collapsed, 'true');

  dock.dispatchEvent(new MouseEvent('pointerenter', { bubbles: true }));
  assert.equal(dock.dataset.collapsed, 'false');

  app.destroy();
});

test('本地图标上传后会更新并持久化', async () => {
  const dom = new JSDOM('<p>正文</p>', {
    url: 'https://example.com',
    pretendToBeVisual: true,
  });
  const { document, Event, File } = dom.window;
  const originalFileReader = dom.window.FileReader;

  class MockFileReader {
    readAsDataURL() {
      this.result = 'data:image/png;base64,custom-icon';
      this.onload?.();
    }
  }

  dom.window.FileReader = MockFileReader;

  try {
    const app = createTypingApp({
      document,
      isVisible: () => true,
      setIntervalFn: () => 1,
      clearIntervalFn: () => {},
    });
    const root = document.querySelector('[data-typing-everywhere-ui]').shadowRoot;
    const settingsButton = root.querySelector('.te-settings-button');

    settingsButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    const fileInput = root.querySelector('input[name="icon-file"]');
    const file = new File(['icon'], 'icon.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [file],
    });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const saved = JSON.parse(dom.window.localStorage.getItem('typing-everywhere-config'));
    assert.equal(saved.icon.type, 'image');
    assert.equal(saved.icon.value, 'data:image/png;base64,custom-icon');
    assert.equal(
      root.querySelector('.te-start-button img').getAttribute('src'),
      'data:image/png;base64,custom-icon',
    );

    root.querySelector('.te-icon-reset').dispatchEvent(new Event('click', { bubbles: true }));
    const resetSaved = JSON.parse(dom.window.localStorage.getItem('typing-everywhere-config'));
    assert.equal(resetSaved.icon.type, 'emoji');
    assert.equal(resetSaved.icon.value, '🤓');
    assert.equal(root.querySelector('.te-start-button img'), null);
    assert.equal(root.querySelector('.te-start-button').textContent, '🤓');

    app.destroy();
  } finally {
    dom.window.FileReader = originalFileReader;
  }
});

test('损坏配置会回退默认值，悬停展开可切换预设主题', () => {
  const dom = new JSDOM('<p>正文</p>', {
    url: 'https://example.com',
    pretendToBeVisual: true,
  });
  const { document, Event, MouseEvent } = dom.window;
  dom.window.localStorage.setItem('typing-everywhere-config', '{bad json');

  const app = createTypingApp({
    document,
    isVisible: () => true,
    setIntervalFn: () => 1,
    clearIntervalFn: () => {},
  });
  const root = document.querySelector('[data-typing-everywhere-ui]').shadowRoot;
  const dock = root.querySelector('.te-dock');
  const settingsButton = root.querySelector('.te-settings-button');

  assert.equal(dom.window.localStorage.getItem('typing-everywhere-config'), null);

  dock.dispatchEvent(new MouseEvent('pointerenter', { bubbles: true }));
  assert.equal(dock.dataset.expanded, 'true');

  settingsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  root.querySelector('.te-settings').dispatchEvent(new Event('input', { bubbles: true }));

  const preset = root.querySelector('input[name="te-theme-preset"][value="HighContrast"]');
  preset.checked = true;
  preset.dispatchEvent(new Event('change', { bubbles: true }));

  const saved = JSON.parse(dom.window.localStorage.getItem('typing-everywhere-config'));
  assert.equal(saved.theme, 'HighContrast');
  assert.equal(
    root.querySelector('.te-outline').style.getPropertyValue('--te-outline-color'),
    '#00b7ff',
  );

  settingsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  dock.dispatchEvent(new MouseEvent('pointerleave', { bubbles: true }));
  assert.equal(dock.dataset.expanded, 'false');

  app.destroy();
});

test('段落跳过预览期间忽略额外输入和重复 Shift+Tab', () => {
  const dom = new JSDOM('<p id="one">AB</p><p id="two">CD</p>', {
    url: 'https://example.com',
    pretendToBeVisual: true,
  });
  const { document, KeyboardEvent, InputEvent } = dom.window;
  let timeoutTask = null;

  const app = createTypingApp({
    document,
    isVisible: () => true,
    scrollIntoView: () => {},
    setIntervalFn: () => 1,
    clearIntervalFn: () => {},
    setTimeoutFn: (callback, delay) => {
      timeoutTask = { callback, delay };
      return 9;
    },
    clearTimeoutFn: () => {
      timeoutTask = null;
    },
  });
  const root = document.querySelector('[data-typing-everywhere-ui]').shadowRoot;

  app.selectParagraph(document.querySelector('#one'));
  document.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  }));
  app.capture.dispatchEvent(new InputEvent('beforeinput', {
    inputType: 'insertText',
    data: 'X',
    bubbles: true,
    cancelable: true,
  }));
  document.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  }));

  assert.deepEqual(app.getSnapshot(), {
    paragraphIndex: 1,
    characterIndex: 0,
    typedCount: 0,
    errorCount: 0,
    done: false,
  });
  assert.deepEqual(
    [...root.querySelectorAll('.te-char')].map((node) => ({
      text: node.textContent,
      state: node.dataset.state,
    })),
    [
      { text: 'A', state: 'skipped' },
      { text: 'B', state: 'skipped' },
    ],
  );

  timeoutTask.callback();
  assert.deepEqual(
    [...root.querySelectorAll('.te-char')].map((node) => ({
      text: node.textContent,
      state: node.dataset.state,
    })),
    [
      { text: 'C', state: 'pending' },
      { text: 'D', state: 'pending' },
    ],
  );

  app.destroy();
});
