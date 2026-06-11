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
    .shadowRoot.querySelector('button');

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
  assert.equal(paragraph.outerHTML, before);
  assert.equal(app.getMode(), 'typing');

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

  app.capture.dispatchEvent(new InputEvent('beforeinput', {
    inputType: 'deleteContentBackward',
    bubbles: true,
    cancelable: true,
  }));
  assert.equal(app.getSnapshot().characterIndex, 0);

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
    .shadowRoot.querySelector('button');

  dispatchPointer(document, 'pointerup', { pointerId: 9, clientX: 1, clientY: 1 });
  assert.equal(app.getMode(), 'idle');

  dispatchPointer(button, 'pointerdown', { pointerId: 1, clientX: 20, clientY: 20 });
  dispatchPointer(document, 'pointermove', { pointerId: 1, clientX: 22, clientY: 22 });
  dispatchPointer(document, 'pointerup', { pointerId: 1, clientX: 22, clientY: 22 });
  assert.equal(app.getMode(), 'selecting');

  app.destroy();
});
