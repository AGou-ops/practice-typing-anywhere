# Typing Everywhere Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个非侵入式 Tampermonkey 单文件脚本，让用户从任意语义文本段开始连续打字，并实时查看 WPM、CPM 和错误率。

**Architecture:** 纯函数模块负责字符、统计、吸附位置和文本候选判断；`TypingSession` 只维护连续练习状态；Shadow DOM UI 只创建脚本自身节点；入口控制器组合上述模块并统一注册、撤销浏览器事件。最终使用 esbuild 将 ESM 源码打包为一个带 userscript 元数据的 IIFE 文件。

**Tech Stack:** JavaScript ES2020、Node.js test runner、jsdom、esbuild、ESLint、c8、Tampermonkey userscript API（仅标准页面能力和 `localStorage`）

---

## File Map

```text
package.json                         开发命令和依赖
eslint.config.js                    ESLint flat config
scripts/build.mjs                   userscript 元数据和单文件构建
src/core/characters.js              Unicode 字符与空白归一化
src/core/metrics.js                 WPM、CPM、错误率
src/core/position.js                图标约束、边缘吸附和持久化数据
src/core/paragraphs.js              语义段落发现、过滤和 DOM 顺序
src/core/session.js                 连续打字状态机
src/ui/widget.js                    Shadow DOM 图标、轮廓、统计弹窗和隐藏输入
src/app.js                          页面事件和模式编排
src/typing-everywhere.user.js       userscript 启动入口
tests/*.test.js                     单元与 jsdom 集成测试
dist/typing-everywhere.user.js      可安装构建产物
```

## Task 1: 建立项目与质量门禁

**Files:**
- Create: `package.json`
- Create: `eslint.config.js`
- Create: `scripts/build.mjs`
- Create: `src/typing-everywhere.user.js`
- Create: `tests/build.test.js`
- Create: `.gitignore`

- [ ] **Step 1: 创建构建契约测试**

```js
// tests/build.test.js
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
```

- [ ] **Step 2: 运行测试并确认因产物不存在而失败**

Run: `node --test tests/build.test.js`

Expected: FAIL，包含 `ENOENT: no such file or directory, open 'dist/typing-everywhere.user.js'`。

- [ ] **Step 3: 创建最小工程配置和构建脚本**

```json
{
  "name": "typing-everywhere",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node scripts/build.mjs",
    "test": "node --test tests/*.test.js",
    "test:coverage": "c8 --check-coverage --lines 90 --functions 90 --branches 85 --reporter=text --reporter=html node --test tests/*.test.js",
    "lint": "eslint .",
    "verify": "npm run lint && npm run test:coverage && npm run build && node --test tests/build.test.js"
  },
  "devDependencies": {
    "@eslint/js": "^9.0.0",
    "c8": "^10.0.0",
    "esbuild": "^0.25.0",
    "eslint": "^9.0.0",
    "globals": "^16.0.0",
    "jsdom": "^26.0.0"
  }
}
```

```js
// scripts/build.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const banner = `// ==UserScript==
// @name         Typing Everywhere
// @namespace    https://github.com/local/typing-everywhere
// @version      0.1.0
// @description  在普通网页文本上进行非侵入式连续打字练习
// @match        *://*/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==`;

await mkdir('dist', { recursive: true });
await build({
  entryPoints: ['src/typing-everywhere.user.js'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome100', 'firefox100'],
  outfile: 'dist/typing-everywhere.user.js.tmp',
});
const bundled = await readFile('dist/typing-everywhere.user.js.tmp', 'utf8');
await writeFile('dist/typing-everywhere.user.js', `${banner}\n\n${bundled}`);
```

```js
// src/typing-everywhere.user.js
(() => {})();
```

```js
// eslint.config.js
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'coverage/', '.superpowers/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser, ...globals.node } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
];
```

```gitignore
node_modules/
dist/*.tmp
coverage/
.superpowers/
```

- [ ] **Step 4: 安装依赖、构建并验证测试转绿**

Run: `npm install && npm run build && node --test tests/build.test.js`

Expected: 1 test PASS，生成 `dist/typing-everywhere.user.js`。

- [ ] **Step 5: 初始化版本库并提交工程骨架**

```bash
git init
git add package.json package-lock.json eslint.config.js scripts/build.mjs src/typing-everywhere.user.js tests/build.test.js .gitignore
git commit -m "chore: scaffold userscript project"
```

## Task 2: 实现字符、指标和图标吸附纯函数

**Files:**
- Create: `src/core/characters.js`
- Create: `src/core/metrics.js`
- Create: `src/core/position.js`
- Create: `tests/core.test.js`

- [ ] **Step 1: 编写纯函数失败测试**

```js
// tests/core.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeText, splitCharacters } from '../src/core/characters.js';
import { calculateMetrics } from '../src/core/metrics.js';
import { clampPosition, snapToNearestEdge } from '../src/core/position.js';

test('归一化空白并按 Unicode 字符拆分', () => {
  assert.equal(normalizeText('  中文\n  A  '), '中文 A');
  assert.deepEqual(splitCharacters('A😀中'), ['A', '😀', '中']);
});

test('根据累计输入计算 WPM、CPM 和错误率', () => {
  assert.deepEqual(calculateMetrics({ typedCount: 50, errorCount: 5, elapsedMs: 60_000 }), {
    wpm: 10, cpm: 50, errorRate: 0.1,
  });
  assert.deepEqual(calculateMetrics({ typedCount: 0, errorCount: 0, elapsedMs: 0 }), {
    wpm: 0, cpm: 0, errorRate: 0,
  });
});

test('图标保持在视口内并吸附最近边缘', () => {
  assert.deepEqual(clampPosition({ x: 990, y: -20 }, { width: 1000, height: 800 }, 40), { x: 960, y: 0 });
  assert.deepEqual(snapToNearestEdge({ x: 900, y: 300 }, { width: 1000, height: 800 }, 40), { x: 960, y: 300 });
});
```

- [ ] **Step 2: 运行测试并确认模块缺失**

Run: `node --test tests/core.test.js`

Expected: FAIL，包含 `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现最小纯函数**

```js
// src/core/characters.js
export function normalizeText(value) {
  return value.replace(/\s+/gu, ' ').trim();
}

export function splitCharacters(value) {
  return Array.from(value);
}
```

```js
// src/core/metrics.js
export function calculateMetrics({ typedCount, errorCount, elapsedMs }) {
  if (typedCount === 0 || elapsedMs <= 0) return { wpm: 0, cpm: 0, errorRate: 0 };
  const minutes = elapsedMs / 60_000;
  return { wpm: typedCount / 5 / minutes, cpm: typedCount / minutes, errorRate: errorCount / typedCount };
}
```

```js
// src/core/position.js
export function clampPosition(position, viewport, size) {
  return {
    x: Math.min(Math.max(position.x, 0), Math.max(viewport.width - size, 0)),
    y: Math.min(Math.max(position.y, 0), Math.max(viewport.height - size, 0)),
  };
}

export function snapToNearestEdge(position, viewport, size) {
  const clamped = clampPosition(position, viewport, size);
  const distances = [
    ['left', clamped.x], ['right', viewport.width - size - clamped.x],
    ['top', clamped.y], ['bottom', viewport.height - size - clamped.y],
  ];
  const [edge] = distances.reduce((best, item) => item[1] < best[1] ? item : best);
  if (edge === 'left') return { ...clamped, x: 0 };
  if (edge === 'right') return { ...clamped, x: viewport.width - size };
  if (edge === 'top') return { ...clamped, y: 0 };
  return { ...clamped, y: viewport.height - size };
}
```

- [ ] **Step 4: 运行测试和 lint**

Run: `node --test tests/core.test.js && npm run lint`

Expected: 3 tests PASS，ESLint 退出码 0。

- [ ] **Step 5: 提交纯函数**

```bash
git add src/core tests/core.test.js
git commit -m "feat: add typing metrics and position helpers"
```

## Task 3: 实现非侵入式语义文本段发现

**Files:**
- Create: `src/core/paragraphs.js`
- Create: `tests/paragraphs.test.js`

- [ ] **Step 1: 编写候选发现和 DOM 不变性测试**

```js
// tests/paragraphs.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { findCandidateFromTarget, listParagraphsFrom } from '../src/core/paragraphs.js';

test('命中嵌套链接时返回最近的完整语义段落', () => {
  const dom = new JSDOM('<p id="p">阅读 <a id="a">链接文字</a></p><input value="忽略">');
  const { document } = dom.window;
  assert.equal(findCandidateFromTarget(document.querySelector('#a')), document.querySelector('#p'));
});

test('按 DOM 顺序列出有效段落并保持原 DOM 不变', () => {
  const dom = new JSDOM('<main><h2>标题</h2><p id="start">第一段</p><p hidden>隐藏</p><li>列表项</li></main>');
  const { document } = dom.window;
  const before = document.querySelector('main').innerHTML;
  const result = listParagraphsFrom(document.querySelector('#start'), { isVisible: element => !element.hidden });
  assert.deepEqual(result.map(element => element.textContent), ['第一段', '列表项']);
  assert.equal(document.querySelector('main').innerHTML, before);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/paragraphs.test.js`

Expected: FAIL，包含 `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现候选判断和顺序查询**

```js
// src/core/paragraphs.js
import { normalizeText } from './characters.js';

export const PARAGRAPH_SELECTOR = 'p,li,blockquote,pre,figcaption,h1,h2,h3,h4,h5,h6';
const EXCLUDED_SELECTOR = 'input,textarea,select,button,[contenteditable]:not([contenteditable="false"]),[aria-hidden="true"],script,style,noscript,[data-typing-everywhere-ui]';

export function defaultIsVisible(element) {
  const style = element.ownerDocument.defaultView.getComputedStyle(element);
  return !element.hidden && style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
}

export function isValidParagraph(element, { isVisible = defaultIsVisible } = {}) {
  return Boolean(element?.matches(PARAGRAPH_SELECTOR)
    && !element.matches(EXCLUDED_SELECTOR)
    && !element.closest(EXCLUDED_SELECTOR)
    && normalizeText(element.innerText ?? element.textContent ?? '')
    && isVisible(element));
}

export function findCandidateFromTarget(target, options = {}) {
  const element = target instanceof target.ownerDocument.defaultView.Element ? target : target.parentElement;
  const candidate = element?.closest(PARAGRAPH_SELECTOR);
  return isValidParagraph(candidate, options) ? candidate : null;
}

export function listParagraphsFrom(start, options = {}) {
  const all = [...start.ownerDocument.querySelectorAll(PARAGRAPH_SELECTOR)];
  return all.slice(all.indexOf(start)).filter(element => isValidParagraph(element, options));
}
```

- [ ] **Step 4: 运行测试并验证不改写目标 DOM**

Run: `node --test tests/paragraphs.test.js`

Expected: 2 tests PASS。

- [ ] **Step 5: 提交文本发现模块**

```bash
git add src/core/paragraphs.js tests/paragraphs.test.js
git commit -m "feat: discover semantic typing paragraphs"
```

## Task 4: 实现连续打字会话状态机

**Files:**
- Create: `src/core/session.js`
- Create: `tests/session.test.js`

- [ ] **Step 1: 编写错误前进、退格、IME 文本和自动切段测试**

```js
// tests/session.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { TypingSession } from '../src/core/session.js';

test('错误字符继续前进且退格不撤销累计统计', () => {
  const session = new TypingSession(['ab']);
  session.typeText('x');
  session.backspace();
  session.typeText('a');
  assert.deepEqual(session.snapshot(), { paragraphIndex: 0, characterIndex: 1, typedCount: 2, errorCount: 1, done: false });
});

test('一次提交多个 IME 字符并自动进入下一段', () => {
  const session = new TypingSession(['中文', '下一段']);
  session.typeText('中文');
  assert.equal(session.snapshot().paragraphIndex, 1);
  assert.equal(session.snapshot().characterIndex, 0);
});

test('最后一段结束后保持等待状态', () => {
  const session = new TypingSession(['A']);
  session.typeText('A');
  assert.equal(session.snapshot().done, true);
  session.appendParagraphs(['B']);
  assert.equal(session.snapshot().done, false);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/session.test.js`

Expected: FAIL，包含 `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现最小状态机**

```js
// src/core/session.js
import { normalizeText, splitCharacters } from './characters.js';

export class TypingSession {
  constructor(paragraphs) {
    this.paragraphs = paragraphs.map(value => splitCharacters(normalizeText(value)));
    this.paragraphIndex = 0;
    this.characterIndex = 0;
    this.typedCount = 0;
    this.errorCount = 0;
    this.done = this.paragraphs.length === 0;
  }

  typeText(value) {
    for (const character of splitCharacters(value)) {
      if (this.done) break;
      const expected = this.paragraphs[this.paragraphIndex][this.characterIndex];
      this.typedCount += 1;
      if (character !== expected) this.errorCount += 1;
      this.characterIndex += 1;
      if (this.characterIndex >= this.paragraphs[this.paragraphIndex].length) this.advanceParagraph();
    }
  }

  backspace() {
    if (!this.done && this.characterIndex > 0) this.characterIndex -= 1;
  }

  advanceParagraph() {
    this.paragraphIndex += 1;
    this.characterIndex = 0;
    this.done = this.paragraphIndex >= this.paragraphs.length;
  }

  appendParagraphs(paragraphs) {
    this.paragraphs.push(...paragraphs.map(value => splitCharacters(normalizeText(value))));
    if (this.done && this.paragraphIndex < this.paragraphs.length) this.done = false;
  }

  snapshot() {
    return { paragraphIndex: this.paragraphIndex, characterIndex: this.characterIndex, typedCount: this.typedCount, errorCount: this.errorCount, done: this.done };
  }
}
```

- [ ] **Step 4: 运行状态机及全部已有测试**

Run: `npm test`

Expected: 全部测试 PASS。

- [ ] **Step 5: 提交状态机**

```bash
git add src/core/session.js tests/session.test.js
git commit -m "feat: add continuous typing session"
```

## Task 5: 实现隔离 UI 组件

**Files:**
- Create: `src/ui/widget.js`
- Create: `tests/widget.test.js`

- [ ] **Step 1: 编写 Shadow DOM、统计渲染和清理测试**

```js
// tests/widget.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { createWidget } from '../src/ui/widget.js';

test('UI 隔离在 Shadow DOM 且目标正文保持不变', () => {
  const dom = new JSDOM('<p id="target"><a href="#">正文</a></p>', { pretendToBeVisual: true });
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
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/widget.test.js`

Expected: FAIL，包含 `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 创建最小 Shadow DOM UI**

```js
// src/ui/widget.js
export function createWidget(document) {
  const host = document.createElement('div');
  host.dataset.typingEverywhereUi = '';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host{all:initial}button,.outline,.stats,.capture{position:fixed;z-index:2147483647;box-sizing:border-box}
    button{top:16px;right:16px;width:44px;height:44px;border:0;border-radius:50%;background:#4f46e5;color:#fff;cursor:grab}
    .outline{display:none;border:2px solid #4f46e5;border-radius:6px;pointer-events:none}
    .stats{display:none;right:16px;bottom:16px;padding:12px 14px;border-radius:9px;background:#17191f;color:#fff;font:13px system-ui}
    .capture{left:-10000px;top:0;width:1px;height:1px;opacity:0}
  </style><button type="button" aria-label="开始打字练习">⌨</button><div class="outline"></div><div class="stats"></div><textarea class="capture" aria-hidden="true"></textarea>`;
  document.documentElement.append(host);
  const outline = root.querySelector('.outline');
  const stats = root.querySelector('.stats');
  return {
    host,
    button: root.querySelector('button'),
    capture: root.querySelector('.capture'),
    setButtonPosition({ x, y }) { Object.assign(root.querySelector('button').style, { left: `${x}px`, top: `${y}px`, right: 'auto' }); },
    showOutline(rect) { Object.assign(outline.style, { display: 'block', top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`, height: `${rect.height}px` }); },
    hideOutline() { outline.style.display = 'none'; },
    showStats(value) { stats.style.display = 'block'; stats.textContent = `${Math.round(value.wpm)} WPM  ${Math.round(value.cpm)} CPM  ${(value.errorRate * 100).toFixed(1)}%  Esc 退出`; },
    hideStats() { stats.style.display = 'none'; },
    destroy() { host.remove(); },
  };
}
```

- [ ] **Step 4: 运行 UI 测试和 lint**

Run: `node --test tests/widget.test.js && npm run lint`

Expected: 测试 PASS，ESLint 退出码 0。

- [ ] **Step 5: 提交隔离 UI**

```bash
git add src/ui/widget.js tests/widget.test.js
git commit -m "feat: add isolated typing widget"
```

## Task 6: 编排拖动、选段、IME、连续切段和 Esc 退出

**Files:**
- Create: `src/app.js`
- Create: `tests/app.test.js`
- Modify: `src/typing-everywhere.user.js`

- [ ] **Step 1: 编写完整状态流集成测试**

```js
// tests/app.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { createTypingApp } from '../src/app.js';

test('选择段落、接收 IME、自动切段并用 Esc 清理模式 UI', () => {
  const dom = new JSDOM('<p id="one">中文</p><p id="two">AB</p>', { url: 'https://example.com', pretendToBeVisual: true });
  const { document, KeyboardEvent, CompositionEvent } = dom.window;
  const original = document.body.innerHTML;
  const app = createTypingApp({ document, now: () => 60_000, isVisible: () => true, scrollIntoView: () => {} });
  app.enterSelectionMode();
  app.selectParagraph(document.querySelector('#one'));
  app.capture.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  app.capture.value = '中文';
  app.capture.dispatchEvent(new CompositionEvent('compositionend', { data: '中文', bubbles: true }));
  assert.equal(app.getSnapshot().paragraphIndex, 1);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(app.getMode(), 'idle');
  assert.equal(document.body.innerHTML, original);
  app.destroy();
});
```

- [ ] **Step 2: 运行测试并确认编排模块缺失**

Run: `node --test tests/app.test.js`

Expected: FAIL，包含 `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现控制器并接入入口**

```js
// src/app.js
import { normalizeText } from './core/characters.js';
import { calculateMetrics } from './core/metrics.js';
import { findCandidateFromTarget, listParagraphsFrom } from './core/paragraphs.js';
import { clampPosition, snapToNearestEdge } from './core/position.js';
import { TypingSession } from './core/session.js';
import { createWidget } from './ui/widget.js';

const POSITION_KEY = 'typing-everywhere-position';
const ICON_SIZE = 44;

export function createTypingApp({
  document,
  now = () => Date.now(),
  isVisible,
  scrollIntoView = element => element.scrollIntoView({ behavior: 'smooth', block: 'center' }),
} = {}) {
  const view = document.defaultView;
  const widget = createWidget(document);
  const removers = [];
  let mode = 'idle';
  let candidate = null;
  let session = null;
  let paragraphElements = [];
  let startedAt = null;
  let composing = false;
  let drag = null;

  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    removers.push(() => target.removeEventListener(type, handler, options));
  }

  function viewport() {
    return { width: view.innerWidth, height: view.innerHeight };
  }

  function restorePosition() {
    try {
      const saved = JSON.parse(view.localStorage.getItem(POSITION_KEY));
      if (!saved) return;
      widget.setButtonPosition(clampPosition({ x: saved.xRatio * view.innerWidth, y: saved.yRatio * view.innerHeight }, viewport(), ICON_SIZE));
    } catch {}
  }

  function savePosition(position) {
    view.localStorage.setItem(POSITION_KEY, JSON.stringify({ xRatio: position.x / view.innerWidth, yRatio: position.y / view.innerHeight }));
  }

  function enterSelectionMode() {
    exitMode();
    mode = 'selecting';
  }

  function selectParagraph(element) {
    paragraphElements = listParagraphsFrom(element, { isVisible });
    session = new TypingSession(paragraphElements.map(item => item.innerText ?? item.textContent ?? ''));
    startedAt = null;
    mode = 'typing';
    candidate = null;
    widget.hideOutline();
    widget.showStats({ wpm: 0, cpm: 0, errorRate: 0 });
    widget.capture.focus();
  }

  function refreshParagraphs() {
    if (!session?.snapshot().done || paragraphElements.length === 0) return;
    const current = paragraphElements.at(-1);
    if (!current?.isConnected) return;
    const discovered = listParagraphsFrom(current, { isVisible }).slice(1);
    const additions = discovered.filter(element => !paragraphElements.includes(element));
    if (additions.length === 0) return;
    paragraphElements.push(...additions);
    session.appendParagraphs(additions.map(element => element.innerText ?? element.textContent ?? ''));
    scrollIntoView(additions[0]);
  }

  function renderMetrics() {
    const state = session.snapshot();
    const elapsedMs = startedAt === null ? 0 : Math.max(now() - startedAt, 1);
    widget.showStats(calculateMetrics({ typedCount: state.typedCount, errorCount: state.errorCount, elapsedMs }));
  }

  function acceptText(text) {
    if (mode !== 'typing' || !text) return;
    if (startedAt === null) startedAt = now();
    const previousIndex = session.snapshot().paragraphIndex;
    session.typeText(text);
    const state = session.snapshot();
    if (!state.done && state.paragraphIndex !== previousIndex) scrollIntoView(paragraphElements[state.paragraphIndex]);
    refreshParagraphs();
    renderMetrics();
  }

  function clearCapture() {
    widget.capture.value = '';
  }

  function exitMode() {
    mode = 'idle';
    candidate = null;
    session = null;
    paragraphElements = [];
    startedAt = null;
    composing = false;
    widget.hideOutline();
    widget.hideStats();
    widget.capture.blur();
    clearCapture();
  }

  function handleSelectionHover(event) {
    if (mode !== 'selecting') return;
    candidate = findCandidateFromTarget(event.target, { isVisible });
    if (!candidate) return widget.hideOutline();
    widget.showOutline(candidate.getBoundingClientRect());
  }

  function handleSelectionClick(event) {
    if (mode !== 'selecting') return;
    const selected = findCandidateFromTarget(event.target, { isVisible });
    if (!selected) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    selectParagraph(selected);
  }

  function handleBeforeInput(event) {
    if (mode !== 'typing') return;
    event.preventDefault();
    if (composing || event.isComposing) return;
    if (event.inputType === 'deleteContentBackward') session.backspace();
    else if (event.inputType.startsWith('insert')) acceptText(event.data ?? '');
    clearCapture();
    renderMetrics();
  }

  function beginDrag(event) {
    drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, moved: false };
    widget.button.setPointerCapture?.(event.pointerId);
  }

  function moveDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.moved ||= Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5;
    if (drag.moved) widget.setButtonPosition(clampPosition({ x: drag.x - ICON_SIZE / 2, y: drag.y - ICON_SIZE / 2 }, viewport(), ICON_SIZE));
  }

  function endDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const finished = drag;
    drag = null;
    if (!finished.moved) return enterSelectionMode();
    const position = snapToNearestEdge({ x: finished.x - ICON_SIZE / 2, y: finished.y - ICON_SIZE / 2 }, viewport(), ICON_SIZE);
    widget.setButtonPosition(position);
    savePosition(position);
  }

  listen(widget.button, 'pointerdown', beginDrag);
  listen(document, 'pointermove', moveDrag, true);
  listen(document, 'pointerup', endDrag, true);
  listen(document, 'pointermove', handleSelectionHover, true);
  listen(document, 'click', handleSelectionClick, true);
  listen(document, 'keydown', event => { if (event.key === 'Escape' && mode !== 'idle') exitMode(); }, true);
  listen(widget.capture, 'beforeinput', handleBeforeInput);
  listen(widget.capture, 'compositionstart', () => { composing = true; });
  listen(widget.capture, 'compositionend', event => { composing = false; acceptText(event.data); clearCapture(); });
  const observer = new view.MutationObserver(refreshParagraphs);
  observer.observe(document.body, { childList: true, subtree: true });
  restorePosition();

  return {
    capture: widget.capture,
    enterSelectionMode,
    selectParagraph,
    getMode: () => mode,
    getSnapshot: () => session?.snapshot() ?? null,
    destroy() { exitMode(); observer.disconnect(); removers.splice(0).forEach(remove => remove()); widget.destroy(); },
  };
}
```

```js
// src/typing-everywhere.user.js
import { createTypingApp } from './app.js';

createTypingApp({ document });
```

- [ ] **Step 4: 添加编排边界测试**

在 `tests/app.test.js` 追加可执行测试：

```js
test('错误输入继续前进且不写入页面表单', () => {
  const dom = new JSDOM('<p id="p">AB</p><input id="page">', { url: 'https://example.com', pretendToBeVisual: true });
  const { document, InputEvent } = dom.window;
  const app = createTypingApp({ document, now: () => 1_000, isVisible: () => true });
  app.selectParagraph(document.querySelector('#p'));
  app.capture.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'X', bubbles: true, cancelable: true }));
  assert.equal(app.getSnapshot().characterIndex, 1);
  assert.equal(app.getSnapshot().errorCount, 1);
  assert.equal(document.querySelector('#page').value, '');
  app.destroy();
});

test('拖动图标后持久化位置且不进入选段模式', () => {
  const dom = new JSDOM('<p>正文</p>', { url: 'https://example.com', pretendToBeVisual: true });
  const { document, Event } = dom.window;
  const app = createTypingApp({ document, isVisible: () => true });
  const button = document.querySelector('[data-typing-everywhere-ui]').shadowRoot.querySelector('button');
  for (const [target, type, values] of [
    [button, 'pointerdown', { pointerId: 1, clientX: 20, clientY: 20 }],
    [document, 'pointermove', { pointerId: 1, clientX: 300, clientY: 200 }],
    [document, 'pointerup', { pointerId: 1, clientX: 300, clientY: 200 }],
  ]) {
    const event = new Event(type, { bubbles: true });
    Object.assign(event, values);
    target.dispatchEvent(event);
  }
  assert.equal(app.getMode(), 'idle');
  assert.match(dom.window.localStorage.getItem('typing-everywhere-position'), /xRatio/);
  app.destroy();
});

test('选段点击被取消且链接 DOM 保持不变', () => {
  const dom = new JSDOM('<p id="p">正文 <a id="link" href="/next">链接</a></p>', { url: 'https://example.com', pretendToBeVisual: true });
  const { document, MouseEvent } = dom.window;
  const app = createTypingApp({ document, isVisible: () => true });
  const paragraph = document.querySelector('#p');
  const before = paragraph.outerHTML;
  app.enterSelectionMode();
  const allowed = document.querySelector('#link').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(allowed, false);
  assert.equal(paragraph.outerHTML, before);
  assert.equal(app.getMode(), 'typing');
  app.destroy();
});

test('destroy 撤销监听并移除全部脚本 UI', () => {
  const dom = new JSDOM('<p>正文</p>', { url: 'https://example.com', pretendToBeVisual: true });
  const { document, KeyboardEvent } = dom.window;
  const app = createTypingApp({ document, isVisible: () => true });
  app.enterSelectionMode();
  app.destroy();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(document.querySelector('[data-typing-everywhere-ui]'), null);
});
```

- [ ] **Step 5: 运行全部测试**

Run: `npm test`

Expected: 全部测试 PASS，目标正文不变性断言通过。

- [ ] **Step 6: 提交浏览器编排**

```bash
git add src/app.js src/typing-everywhere.user.js tests/app.test.js
git commit -m "feat: connect typing workflow"
```

## Task 7: 完成覆盖率、构建和真实浏览器验收

**Files:**
- Modify: `tests/*.test.js`（只补充未覆盖的规格边界）
- Create: `README.md`
- Generate: `dist/typing-everywhere.user.js`

- [ ] **Step 1: 运行覆盖率门禁并定位缺口**

Run: `npm run test:coverage`

Expected: lines/functions 至少 90%，branches 至少 85%；若失败，只为未覆盖规格行为添加测试，不降低阈值。

- [ ] **Step 2: 编写安装和使用说明**

```md
# Typing Everywhere

## 安装
1. 安装 Tampermonkey。
2. 执行 `npm install && npm run build`。
3. 在 Tampermonkey 中安装 `dist/typing-everywhere.user.js`。

## 使用
拖动右上角图标可调整位置；点击图标后选择完整文本段并开始输入。右下角实时显示 WPM、CPM 和错误率。按 `Esc` 退出打字模式。

## 限制
不支持浏览器内部页面、Chrome Web Store、浏览器 PDF、Canvas 文本和跨域 iframe。
```

- [ ] **Step 3: 执行完整质量门禁**

Run: `npm run verify`

Expected: lint、coverage、build 和构建产物测试全部 PASS。

- [ ] **Step 4: 在本地测试页执行浏览器验收**

创建临时测试页并启动静态服务器：

```bash
mkdir -p tmp/manual
printf '%s\n' '<!doctype html><meta charset="utf-8"><h1>Typing Test</h1><p>English <a href="#ok">linked text</a>.</p><p>中文输入法测试。</p><input placeholder="页面输入框">' > tmp/manual/index.html
python3 -m http.server 4173 --directory tmp/manual
```

在 Tampermonkey 已安装构建产物的浏览器打开 `http://localhost:4173`，逐项确认：图标拖动吸附并刷新后保留位置；链接段落可整段选择且 DOM/链接仍可在退出后正常使用；英文错误输入继续前进；中文 IME 只在提交后计数；完成首段后自动滚动并进入下一段；右下角只显示 WPM、CPM、错误率；`Esc` 后统计消失且页面输入框恢复正常。

- [ ] **Step 5: 提交文档和构建产物**

```bash
git add README.md dist/typing-everywhere.user.js tests
git commit -m "docs: add installation and verification guide"
```

## Final Verification Checklist

- [ ] `npm run verify` 退出码为 0。
- [ ] 核心逻辑行覆盖率和函数覆盖率不低于 90%，分支覆盖率不低于 85%。
- [ ] `dist/typing-everywhere.user.js` 可直接安装且不含 ESM `import`。
- [ ] 目标文本段在选段、输入、自动切段和退出前后 DOM 保持一致。
- [ ] 入口支持拖动、边缘吸附、位置持久化且拖动不误触发点击。
- [ ] 普通输入、错误输入、退格和中文 IME 行为符合规格。
- [ ] 右下角仅显示 WPM、CPM、错误率和 `Esc` 提示。
- [ ] 不出现完成页、结果页、重练按钮或退出按钮。
- [ ] 按 `Esc` 后页面键盘、点击和表单输入行为恢复正常。
