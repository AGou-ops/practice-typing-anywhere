# Typing Everywhere Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有油猴脚本上增加中央提示、设置面板、`Tab/Shift+Tab` 跳过逻辑、可配置颜色、滚动跟随开关和入口空闲缩边隐藏。

**Architecture:** 保持当前 `core/session + ui/widget + app controller` 结构不变，但把“字符渲染状态”“入口交互状态”“本地配置”和“空闲计时”各自收敛成明确边界。`session` 负责字符状态和统计排除；`widget` 负责入口、提示层、设置面板和覆盖层呈现；`app` 负责编排状态切换、持久化和浏览器事件拦截。

**Tech Stack:** JavaScript ES2020、Node.js test runner、jsdom、Shadow DOM、Tampermonkey userscript、ESLint、Node 内置测试覆盖率

---

## File Map

```text
src/core/session.js          字符状态、跳过规则、统计计数边界
src/core/position.js         入口安全边距、缩边位置计算
src/core/config.js           新增：主题、颜色和行为开关默认值/持久化 helpers
src/ui/widget.js             入口按钮、设置按钮、中央提示、设置面板、覆盖层和统计层
src/app.js                   状态编排、空闲计时器、Tab/Shift+Tab、跟随滚动与配置应用
src/typing-everywhere.user.js userscript 启动入口
tests/session.test.js        跳过规则与渲染状态
tests/core.test.js           位置与边距纯函数
tests/widget.test.js         设置面板、提示层、主题应用和覆盖层显隐
tests/app.test.js            完整交互流、空闲缩边、定时刷新、跟随开关
README.md                    使用说明更新
dist/typing-everywhere.user.js 构建产物
```

## Task 1: 建立配置模型与主题默认值

**Files:**
- Create: `src/core/config.js`
- Modify: `tests/core.test.js`

- [ ] **Step 1: 写配置与主题失败测试**

```js
// tests/core.test.js 追加
import {
  DEFAULT_CONFIG,
  PRESET_THEMES,
  mergeConfig,
} from '../src/core/config.js';

test('合并部分配置时保留默认主题和行为开关', () => {
  assert.equal(PRESET_THEMES.Classic.colors.pending, '#9ca3af');
  assert.deepEqual(
    mergeConfig({
      colors: { error: '#ff0000' },
      behavior: { followCurrentParagraph: false },
    }),
    {
      ...DEFAULT_CONFIG,
      colors: {
        ...DEFAULT_CONFIG.colors,
        error: '#ff0000',
      },
      behavior: {
        ...DEFAULT_CONFIG.behavior,
        followCurrentParagraph: false,
      },
    },
  );
});
```

- [ ] **Step 2: 运行测试确认缺模块失败**

Run: `node --test tests/core.test.js`

Expected: FAIL，包含 `ERR_MODULE_NOT_FOUND` 指向 `src/core/config.js`。

- [ ] **Step 3: 实现最小配置模块**

```js
// src/core/config.js
export const PRESET_THEMES = {
  Classic: {
    colors: {
      outline: '#1f6feb',
      pending: '#9ca3af',
      correct: '#111827',
      error: '#111827',
      errorBackground: '#ff7b6b',
      skipped: '#2563eb',
    },
  },
  Soft: {
    colors: {
      outline: '#7c8aa5',
      pending: '#b6bcc8',
      correct: '#1f2937',
      error: '#ffffff',
      errorBackground: '#d97706',
      skipped: '#6d28d9',
    },
  },
  HighContrast: {
    colors: {
      outline: '#00b7ff',
      pending: '#8b95a7',
      correct: '#000000',
      error: '#ffffff',
      errorBackground: '#dc2626',
      skipped: '#0f766e',
    },
  },
};

export const DEFAULT_CONFIG = {
  theme: 'Classic',
  colors: { ...PRESET_THEMES.Classic.colors },
  behavior: {
    followCurrentParagraph: true,
  },
};

export function mergeConfig(partial = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...partial,
    colors: {
      ...DEFAULT_CONFIG.colors,
      ...partial.colors,
    },
    behavior: {
      ...DEFAULT_CONFIG.behavior,
      ...partial.behavior,
    },
  };
}
```

- [ ] **Step 4: 运行测试**

Run: `node --test tests/core.test.js`

Expected: `tests/core.test.js` 全部 PASS。

- [ ] **Step 5: 提交配置基础**

```bash
git add src/core/config.js tests/core.test.js
git commit -m "feat: add typing theme configuration defaults"
```

## Task 2: 扩展 session 支持 skipped 与统计排除

**Files:**
- Modify: `src/core/session.js`
- Modify: `tests/session.test.js`

- [ ] **Step 1: 写跳过字符和整段跳过失败测试**

```js
// tests/session.test.js 追加
test('Tab 跳过字符会标记 skipped 但不增加 typedCount', () => {
  const session = new TypingSession(['AB']);

  session.skipCharacter();

  assert.deepEqual(session.snapshot(), {
    paragraphIndex: 0,
    characterIndex: 1,
    typedCount: 0,
    errorCount: 0,
    done: false,
  });
  assert.deepEqual(session.getRenderState(0), [
    { text: 'A', state: 'skipped' },
    { text: 'B', state: 'pending' },
  ]);
});

test('Shift+Tab 跳过当前段剩余字符并切到下一段', () => {
  const session = new TypingSession(['ABC', '下一段']);

  session.typeText('A');
  const preview = session.skipParagraph();

  assert.deepEqual(preview, [
    { text: 'A', state: 'correct' },
    { text: 'B', state: 'skipped' },
    { text: 'C', state: 'skipped' },
  ]);
  assert.equal(session.snapshot().paragraphIndex, 1);
  assert.equal(session.snapshot().typedCount, 1);
});
```

- [ ] **Step 2: 运行测试确认缺方法失败**

Run: `node --test tests/session.test.js`

Expected: FAIL，包含 `skipCharacter is not a function` 或 `skipParagraph is not a function`。

- [ ] **Step 3: 实现最小跳过逻辑**

```js
// src/core/session.js 新增公开方法
skipCharacter() {
  if (this.done) return null;
  this.entries[this.paragraphIndex][this.characterIndex] = {
    value: this.paragraphs[this.paragraphIndex][this.characterIndex],
    correct: false,
    skipped: true,
  };
  this.characterIndex += 1;
  if (this.characterIndex >= this.paragraphs[this.paragraphIndex].length) {
    this.#advanceParagraph();
  }
  return this.getRenderState(this.paragraphIndex);
}

skipParagraph() {
  if (this.done) return [];
  const currentIndex = this.paragraphIndex;
  while (!this.done && this.paragraphIndex === currentIndex) {
    if (this.entries[currentIndex][this.characterIndex] === null) {
      this.entries[currentIndex][this.characterIndex] = {
        value: this.paragraphs[currentIndex][this.characterIndex],
        correct: false,
        skipped: true,
      };
    }
    this.characterIndex += 1;
    if (this.characterIndex >= this.paragraphs[currentIndex].length) {
      this.#advanceParagraph();
    }
  }
  return this.getRenderState(currentIndex);
}
```

并将 `getRenderState()` 中的状态判断改成：

```js
if (!entry) return { text: expected, state: 'pending' };
if (entry.skipped) return { text: entry.value, state: 'skipped' };
return { text: entry.value, state: entry.correct ? 'correct' : 'error' };
```

- [ ] **Step 4: 运行 session 测试**

Run: `node --test tests/session.test.js`

Expected: `tests/session.test.js` 全部 PASS。

- [ ] **Step 5: 提交 skipped 状态**

```bash
git add src/core/session.js tests/session.test.js
git commit -m "feat: add skipped character states"
```

## Task 3: 扩展 widget 支持中央提示、设置面板和主题应用

**Files:**
- Modify: `src/ui/widget.js`
- Modify: `tests/widget.test.js`

- [ ] **Step 1: 写提示层和设置面板失败测试**

```js
// tests/widget.test.js 追加
test('可显示中央提示层并应用主题颜色', () => {
  const dom = new JSDOM('<p id="target">正文</p>', { pretendToBeVisual: true });
  const { document } = dom.window;
  const widget = createWidget(document);

  widget.showPrompt('请选择一段文本', 'Esc 退出');
  widget.applyTheme({
    outline: '#00ff88',
    pending: '#888888',
    correct: '#111111',
    error: '#ffffff',
    errorBackground: '#ff0000',
    skipped: '#3366ff',
  });

  const root = widget.host.shadowRoot;
  assert.match(root.querySelector('.te-prompt').textContent, /请选择一段文本/);
  assert.equal(root.querySelector('.te-prompt').style.display, 'block');
  assert.match(root.querySelector('style').textContent, /--te-outline-color:\s*#00ff88/);

  widget.destroy();
});

test('设置面板可展开并渲染 3 套预设和跟随开关', () => {
  const dom = new JSDOM('<p>正文</p>', { pretendToBeVisual: true });
  const { document } = dom.window;
  const widget = createWidget(document);

  widget.showSettings({
    theme: 'Classic',
    colors: {},
    behavior: { followCurrentParagraph: true },
  });

  const root = widget.host.shadowRoot;
  assert.equal(root.querySelector('.te-settings').style.display, 'block');
  assert.equal(root.querySelectorAll('[data-theme]').length, 3);
  assert.equal(root.querySelector('[name="followCurrentParagraph"]').checked, true);

  widget.destroy();
});
```

- [ ] **Step 2: 运行测试确认方法缺失**

Run: `node --test tests/widget.test.js`

Expected: FAIL，包含 `showPrompt is not a function` 或 `showSettings is not a function`。

- [ ] **Step 3: 实现最小提示层和设置面板**

在 `src/ui/widget.js` 中至少新增：

```js
const root = host.attachShadow({ mode: 'open' });
root.innerHTML = `
  <style>
    :host {
      --te-outline-color: #1f6feb;
      --te-pending-color: #9ca3af;
      --te-correct-color: #111827;
      --te-error-color: #111827;
      --te-error-bg: #ff7b6b;
      --te-skipped-color: #2563eb;
    }
    .te-prompt { display: none; position: fixed; inset: 0; pointer-events: none; }
    .te-settings { display: none; position: fixed; }
  </style>
  <button class="te-button" type="button" aria-label="开始打字练习"></button>
  <button class="te-settings-button" type="button" aria-label="打开设置"></button>
  <div class="te-prompt"><div class="te-prompt-card"><strong class="te-prompt-title"></strong><span class="te-prompt-hint"></span></div></div>
  <div class="te-settings"></div>
`;
```

并提供这组方法：

```js
showPrompt(title, hint) { ... }
hidePrompt() { ... }
showSettings(config) { ... }
hideSettings() { ... }
applyTheme(colors) { ... }
```

`applyTheme(colors)` 必须通过写入 CSS 自定义属性来更新配色，而不是逐字符改内联样式。

- [ ] **Step 4: 跑 widget 测试**

Run: `node --test tests/widget.test.js`

Expected: `tests/widget.test.js` 全部 PASS。

- [ ] **Step 5: 提交 UI 面板基础**

```bash
git add src/ui/widget.js tests/widget.test.js
git commit -m "feat: add prompt and settings surfaces"
```

## Task 4: 在 app 中接入配置、Tab/Shift+Tab 和实时计时刷新

**Files:**
- Modify: `src/app.js`
- Modify: `tests/app.test.js`

- [ ] **Step 1: 写按键跳过和实时刷新失败测试**

```js
// tests/app.test.js 追加
test('Tab 跳过字符并渲染 skipped 颜色，不增加 typedCount', () => {
  const dom = new JSDOM('<p id="p">AB</p>', { url: 'https://example.com', pretendToBeVisual: true });
  const { document, KeyboardEvent } = dom.window;
  const app = createTypingApp({ document, now: () => 1_000, isVisible: () => true });

  app.selectParagraph(document.querySelector('#p'));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));

  assert.equal(app.getSnapshot().typedCount, 0);
  assert.deepEqual(
    [...document.querySelector('[data-typing-everywhere-ui]').shadowRoot.querySelectorAll('.te-char')]
      .map((node) => node.dataset.state),
    ['skipped', 'pending'],
  );
  app.destroy();
});

test('统计在无新输入时也会按时间刷新', async () => {
  let nowValue = 1_000;
  const dom = new JSDOM('<p id="p">AB</p>', { url: 'https://example.com', pretendToBeVisual: true });
  const { document, InputEvent } = dom.window;
  const app = createTypingApp({ document, now: () => nowValue, isVisible: () => true });

  app.selectParagraph(document.querySelector('#p'));
  app.capture.dispatchEvent(new InputEvent('beforeinput', {
    inputType: 'insertText',
    data: 'A',
    bubbles: true,
    cancelable: true,
  }));

  const root = document.querySelector('[data-typing-everywhere-ui]').shadowRoot;
  const first = root.querySelector('.te-stats').textContent;
  nowValue = 61_000;
  await new Promise((resolve) => setTimeout(resolve, 300));
  const second = root.querySelector('.te-stats').textContent;

  assert.notEqual(first, second);
  app.destroy();
});
```

- [ ] **Step 2: 运行测试确认当前实现失败**

Run: `node --test tests/app.test.js`

Expected: FAIL，至少包含 `typedCount` 未按预期保持为 0 或统计文案未变化。

- [ ] **Step 3: 实现最小键位与计时器接入**

在 `src/app.js` 中：

1. 引入配置：

```js
import { DEFAULT_CONFIG, mergeConfig } from './core/config.js';
```

2. 建立运行时配置和计时器：

```js
let config = loadConfig();
let statsTimer = null;

function startStatsTimer() {
  stopStatsTimer();
  statsTimer = view.setInterval(() => {
    if (mode === 'typing' && startedAt !== null) renderMetrics();
  }, 250);
}

function stopStatsTimer() {
  if (statsTimer !== null) view.clearInterval(statsTimer);
  statsTimer = null;
}
```

3. 在 `selectParagraph()` 中启动计时器，在 `exitMode()`/`destroy()` 中停止。

4. 在 `handleKeydown(event)` 中加入：

```js
if (mode === 'typing' && event.key === 'Tab') {
  event.preventDefault();
  if (event.shiftKey) {
    const preview = session.skipParagraph();
    widget.showSkipPreview(paragraphElements[session.snapshot().paragraphIndex - 1] ?? paragraphElements[0], preview);
    view.setTimeout(() => {
      syncTypingLayer();
      if (config.behavior.followCurrentParagraph && !session.snapshot().done) {
        scrollIntoView(paragraphElements[session.snapshot().paragraphIndex]);
      }
    }, 600);
  } else {
    session.skipCharacter();
    syncTypingLayer();
  }
  renderMetrics();
  return;
}
```

5. 在切段滚动时改成：

```js
if (config.behavior.followCurrentParagraph && !nextState.done && nextState.paragraphIndex !== previousIndex) {
  scrollIntoView(paragraphElements[nextState.paragraphIndex]);
}
```

- [ ] **Step 4: 运行 app 测试**

Run: `node --test tests/app.test.js`

Expected: 新增跳过与实时刷新测试 PASS。

- [ ] **Step 5: 提交控制器增强**

```bash
git add src/app.js tests/app.test.js
git commit -m "feat: add skip keys and live stats refresh"
```

## Task 5: 接入中央提示、设置展开和配置持久化

**Files:**
- Modify: `src/app.js`
- Modify: `tests/app.test.js`
- Modify: `README.md`

- [ ] **Step 1: 写提示层和设置交互失败测试**

```js
// tests/app.test.js 追加
test('点击主图标进入 selecting 时显示中央提示', () => {
  const dom = new JSDOM('<p>正文</p>', { url: 'https://example.com', pretendToBeVisual: true });
  const { document } = dom.window;
  const app = createTypingApp({ document, isVisible: () => true });
  const root = document.querySelector('[data-typing-everywhere-ui]').shadowRoot;
  const mainButton = root.querySelector('.te-button');

  dispatchPointer(mainButton, 'pointerdown', { pointerId: 1, clientX: 20, clientY: 20 });
  dispatchPointer(document, 'pointerup', { pointerId: 1, clientX: 20, clientY: 20 });

  assert.equal(root.querySelector('.te-prompt').style.display, 'block');
  app.destroy();
});

test('点击设置按钮可展开设置并切换 followCurrentParagraph', () => {
  const dom = new JSDOM('<p>正文</p>', { url: 'https://example.com', pretendToBeVisual: true });
  const { document, Event } = dom.window;
  const app = createTypingApp({ document, isVisible: () => true });
  const root = document.querySelector('[data-typing-everywhere-ui]').shadowRoot;
  const settingsButton = root.querySelector('.te-settings-button');

  settingsButton.dispatchEvent(new Event('click', { bubbles: true }));
  const checkbox = root.querySelector('[name=\"followCurrentParagraph\"]');
  checkbox.checked = false;
  checkbox.dispatchEvent(new Event('change', { bubbles: true }));

  assert.equal(root.querySelector('.te-settings').style.display, 'block');
  assert.equal(JSON.parse(dom.window.localStorage.getItem('typing-everywhere-config')).behavior.followCurrentParagraph, false);
  app.destroy();
});
```

- [ ] **Step 2: 运行测试确认提示层/设置未接入**

Run: `node --test tests/app.test.js`

Expected: FAIL，提示层或配置持久化断言失败。

- [ ] **Step 3: 实现最小提示与设置编排**

在 `src/app.js` 中新增：

```js
const CONFIG_KEY = 'typing-everywhere-config';

function loadConfig() {
  try {
    return mergeConfig(JSON.parse(view.localStorage.getItem(CONFIG_KEY) ?? 'null') ?? {});
  } catch {
    return mergeConfig();
  }
}

function saveConfig() {
  view.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}
```

并接入：

```js
widget.applyTheme(config.colors);
listen(widget.settingsButton, 'click', () => {
  if (widget.isSettingsVisible()) widget.hideSettings();
  else widget.showSettings(config);
});
listen(widget.host.shadowRoot, 'change', handleSettingsChange);
```

`enterSelectionMode()` 中调用：

```js
widget.showPrompt('请选择一段文本', 'Esc 退出');
```

`selectParagraph()` 与 `exitMode()` 中调用：

```js
widget.hidePrompt();
```

- [ ] **Step 4: 更新 README 中的新键位与设置说明**

```md
## 使用
左键主图标开始选段，设置按钮展开主题与颜色设置。打字模式下 `Tab` 跳过当前字符，`Shift+Tab` 跳过当前段，`Esc` 退出。可关闭自动跟随滚动。
```

- [ ] **Step 5: 运行测试**

Run: `node --test tests/app.test.js && npm test`

Expected: app 测试和全量测试 PASS。

- [ ] **Step 6: 提交提示与设置功能**

```bash
git add src/app.js tests/app.test.js README.md
git commit -m "feat: add prompt and settings interactions"
```

## Task 6: 实现入口安全边距、右键限制和空闲缩边隐藏

**Files:**
- Modify: `src/core/position.js`
- Modify: `src/ui/widget.js`
- Modify: `src/app.js`
- Modify: `tests/core.test.js`
- Modify: `tests/app.test.js`

- [ ] **Step 1: 写安全边距和缩边失败测试**

```js
// tests/core.test.js 追加
test('吸附时保留安全边距，缩边时只留下把手宽度', () => {
  assert.deepEqual(
    snapToNearestEdge({ x: 980, y: 100 }, { width: 1000, height: 800 }, 44, { inset: 12 }),
    { x: 944, y: 100 },
  );
});
```

```js
// tests/app.test.js 追加
test('右键主图标不触发拖动且 5 分钟空闲后进入缩边状态', async () => {
  let nowValue = 0;
  const dom = new JSDOM('<p>正文</p>', { url: 'https://example.com', pretendToBeVisual: true });
  const { document, MouseEvent } = dom.window;
  const app = createTypingApp({ document, isVisible: () => true, now: () => nowValue });
  const root = document.querySelector('[data-typing-everywhere-ui]').shadowRoot;
  const button = root.querySelector('.te-button');

  button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  assert.equal(app.getMode(), 'idle');

  nowValue = 301_000;
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(root.querySelector('.te-entry').dataset.collapsed, 'true');
  app.destroy();
});
```

- [ ] **Step 2: 运行测试确认现状失败**

Run: `node --test tests/core.test.js tests/app.test.js`

Expected: FAIL，吸附位置或 `collapsed` 状态断言失败。

- [ ] **Step 3: 实现最小安全边距与空闲计时器**

在 `src/core/position.js` 将签名扩展为：

```js
export function clampPosition(position, viewport, size, options = {}) { ... }
export function snapToNearestEdge(position, viewport, size, options = {}) { ... }
```

加入：

```js
const inset = options.inset ?? 12;
```

在 `src/app.js` 中新增：

```js
let idleTimer = null;

function scheduleIdleCollapse() {
  clearIdleCollapse();
  if (mode !== 'idle') return;
  idleTimer = view.setTimeout(() => {
    widget.setCollapsed(true);
  }, 300_000);
}

function clearIdleCollapse() {
  if (idleTimer !== null) view.clearTimeout(idleTimer);
  idleTimer = null;
}

function markInteraction() {
  widget.setCollapsed(false);
  if (mode === 'idle') scheduleIdleCollapse();
}
```

并在入口、设置与退出路径中调用 `markInteraction()`。

在 `src/ui/widget.js` 中为入口外层增加：

```js
<div class="te-entry" data-collapsed="false">...</div>
```

并提供：

```js
setCollapsed(collapsed) {
  entry.dataset.collapsed = String(collapsed);
}
```

- [ ] **Step 4: 运行测试**

Run: `node --test tests/core.test.js tests/app.test.js`

Expected: 新增安全边距与空闲缩边测试 PASS。

- [ ] **Step 5: 提交入口行为优化**

```bash
git add src/core/position.js src/ui/widget.js src/app.js tests/core.test.js tests/app.test.js
git commit -m "feat: add edge-safe entry collapse behavior"
```

## Task 7: 全量验收与构建产物更新

**Files:**
- Modify: `README.md`
- Generate: `dist/typing-everywhere.user.js`

- [ ] **Step 1: 跑完整质量门禁**

Run: `npm run verify`

Expected: lint、覆盖率、构建和构建产物测试全部 PASS。

- [ ] **Step 2: 更新安装说明中的增强行为**

在 `README.md` 中补充：

```md
## 新增交互
- 中央提示引导选段
- 设置按钮支持预设主题和高级颜色
- Tab 跳过字符，Shift+Tab 跳过整段
- 右下角速度按时间实时刷新
- 入口空闲 5 分钟后缩边隐藏
```

- [ ] **Step 3: 浏览器手工验收**

Run:

```bash
python3 -m http.server 4173
```

在浏览器打开 `http://127.0.0.1:4173/tmp/manual/index.html`，逐项确认：

- 左键主图标进入中央提示，设置按钮单独展开面板
- 主题和自定义颜色即时作用于当前覆盖层
- `Tab` 跳过字符显示跳过色，速度数字不因跳过增加
- `Shift+Tab` 跳过当前段并在约 600ms 后进入下一段
- 关闭跟随后切段不自动滚动
- 右键主图标不开始拖动
- 5 分钟空闲后图标缩到边缘，只保留把手，hover 可滑出

- [ ] **Step 4: 提交最终增强**

```bash
git add README.md dist/typing-everywhere.user.js
git commit -m "docs: finalize typing enhancements"
```

## Final Verification Checklist

- [ ] `npm run verify` 通过。
- [ ] `Tab` 和 `Shift+Tab` 跳过不计入速度统计。
- [ ] 右下角速度会随时间自动刷新。
- [ ] 中央提示层、设置面板和覆盖层可同时遵守状态切换。
- [ ] 颜色配置支持预设和手工改色，并可持久化。
- [ ] 入口右键不拖动，空闲后可缩边隐藏。
- [ ] 跟随滚动开关关闭后不自动滚动页面。
- [ ] 退出后目标段落样式恢复，页面业务交互恢复。
