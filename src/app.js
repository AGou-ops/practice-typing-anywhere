import { DEFAULT_CONFIG, PRESET_THEMES, mergeConfig } from './core/config.js';
import { calculateMetrics } from './core/metrics.js';
import {
  defaultIsVisible,
  findCandidateFromTarget,
  listParagraphsFrom,
} from './core/paragraphs.js';
import {
  clampPosition,
  getClosestEdge,
  snapToNearestEdge,
} from './core/position.js';
import { TypingSession } from './core/session.js';
import { createWidget } from './ui/widget.js';

const ICON_SIZE = 44;
const BUTTON_INSET = 24;
const POSITION_KEY = 'typing-everywhere-position';
const CONFIG_KEY = 'typing-everywhere-config';
const STATS_POSITION_KEY = 'typing-everywhere-stats-position';
const STATS_INTERVAL_MS = 250;
const IDLE_COLLAPSE_MS = 5 * 60 * 1000;
const PARAGRAPH_SKIP_PREVIEW_MS = 600;

export function createTypingApp({
  document,
  now = () => Date.now(),
  isVisible = defaultIsVisible,
  scrollIntoView = (element) => {
    element.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  },
  setIntervalFn = (callback, delay) => document.defaultView.setInterval(callback, delay),
  clearIntervalFn = (timerId) => document.defaultView.clearInterval(timerId),
  setTimeoutFn = (callback, delay) => document.defaultView.setTimeout(callback, delay),
  clearTimeoutFn = (timerId) => document.defaultView.clearTimeout(timerId),
} = {}) {
  const view = document.defaultView;
  if (view.top !== view.self || document.querySelector('[data-typing-everywhere-ui]')) {
    return createNoopApp(document);
  }

  const widget = createWidget(document);
  const cleanups = [];
  const observer = new view.MutationObserver(() => {
    refreshParagraphs();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  let mode = 'idle';
  let candidate = null;
  let session = null;
  let paragraphElements = [];
  let startedAt = null;
  let composing = false;
  let drag = null;
  let statsDrag = null;
  let currentDockEdge = 'right';
  let statsTimerId = null;
  let paragraphSkipTimerId = null;
  let previewParagraphIndex = null;
  let settingsOpen = false;
  let config = loadConfig();
  let lastActivityAt = now();

  widget.hideOutline();
  widget.hideStats();
  widget.hidePrompt();
  widget.hideSettings();
  widget.setExpanded(false);
  widget.setIdleCollapsed(false, currentDockEdge);
  widget.setIcon(config.icon);
  widget.applyTheme(getEffectiveColors());
  clearCapture();
  restoreButtonPosition();
  restoreStatsPosition();
  ensureStatsTimer();

  listen(widget.button, 'pointerdown', beginDrag);
  listen(widget.button, 'contextmenu', suppressContextMenu);
  listen(widget.settingsButton, 'click', toggleSettingsPanel);
  listen(widget.settingsButton, 'contextmenu', suppressContextMenu);
  listen(widget.dock, 'pointerenter', handleDockPointerEnter);
  listen(widget.dock, 'pointerleave', handleDockPointerLeave);
  listen(widget.stats, 'pointerdown', beginStatsDrag);
  listen(document, 'pointermove', moveDrag, true);
  listen(document, 'pointerup', endDrag, true);
  listen(document, 'pointermove', handleSelectionHover, true);
  listen(document, 'click', handleSelectionClick, true);
  listen(document, 'keydown', handleKeydown, true);
  listen(view, 'scroll', syncTypingLayer, true);
  listen(view, 'resize', syncTypingLayer);
  listen(widget.capture, 'beforeinput', handleBeforeInput);
  listen(widget.capture, 'compositionstart', () => {
    composing = true;
    touch();
  });
  listen(widget.capture, 'compositionend', (event) => {
    composing = false;
    touch();
    acceptText(event.data ?? '');
    clearCapture();
  });
  listen(widget.settings, 'input', handleSettingsInput);
  listen(widget.settings, 'change', handleSettingsInput);
  listen(widget.settings, 'click', handleSettingsClick);

  return {
    capture: widget.capture,
    enterSelectionMode,
    selectParagraph,
    getMode: () => mode,
    getSnapshot: () => session?.snapshot() ?? null,
    destroy,
  };

  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  }

  function touch() {
    lastActivityAt = now();
    widget.setIdleCollapsed(false, currentDockEdge);
  }

  function getViewport() {
    return { width: view.innerWidth, height: view.innerHeight };
  }

  function loadConfig() {
    const raw = view.localStorage.getItem(CONFIG_KEY);

    if (!raw) {
      return mergeConfig(DEFAULT_CONFIG);
    }

    try {
      return mergeConfig(JSON.parse(raw));
    } catch {
      view.localStorage.removeItem(CONFIG_KEY);
      return mergeConfig(DEFAULT_CONFIG);
    }
  }

  function saveConfig() {
    view.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  }

  function getEffectiveColors() {
    if (config.behavior.followCorrectTextColor) {
      return {
        ...config.colors,
        correct: 'currentColor',
      };
    }

    return config.colors;
  }

  function restoreButtonPosition() {
    const raw = view.localStorage.getItem(POSITION_KEY);

    if (!raw) {
      widget.setDockEdge(currentDockEdge);
      return;
    }

    try {
      const saved = JSON.parse(raw);
      const position = clampPosition(
        {
          x: saved.xRatio * view.innerWidth,
          y: saved.yRatio * view.innerHeight,
        },
        getViewport(),
        ICON_SIZE,
        BUTTON_INSET,
      );
      currentDockEdge = saved.edge ?? getClosestEdge(position, getViewport(), ICON_SIZE, BUTTON_INSET);
      widget.setDockEdge(currentDockEdge);
      widget.setButtonPosition(position);
    } catch {
      view.localStorage.removeItem(POSITION_KEY);
    }
  }

  function restoreStatsPosition() {
    const raw = view.localStorage.getItem(STATS_POSITION_KEY);
    if (!raw) {
      return;
    }

    try {
      const saved = JSON.parse(raw);
      const defaultRect = { width: 220, height: 44 };
      const position = clampFloatingPanelPosition(
        {
          x: saved.xRatio * view.innerWidth,
          y: saved.yRatio * view.innerHeight,
        },
        getViewport(),
        defaultRect,
      );
      widget.setStatsPosition(position);
    } catch {
      view.localStorage.removeItem(STATS_POSITION_KEY);
    }
  }

  function saveStatsPosition(position) {
    view.localStorage.setItem(
      STATS_POSITION_KEY,
      JSON.stringify({
        xRatio: position.x / Math.max(view.innerWidth, 1),
        yRatio: position.y / Math.max(view.innerHeight, 1),
      }),
    );
  }

  function saveButtonPosition(position) {
    view.localStorage.setItem(
      POSITION_KEY,
      JSON.stringify({
        edge: currentDockEdge,
        xRatio: position.x / Math.max(view.innerWidth, 1),
        yRatio: position.y / Math.max(view.innerHeight, 1),
      }),
    );
  }

  function enterSelectionMode() {
    exitMode();
    touch();
    mode = 'selecting';
    settingsOpen = false;
    widget.hideSettings();
    widget.setExpanded(true);
    widget.showPrompt('请选择一段文本，Esc 退出');
  }

  function selectParagraph(element) {
    paragraphElements = listParagraphsFrom(element, { isVisible });

    if (paragraphElements.length === 0) {
      exitMode();
      return;
    }

    clearParagraphSkipPreview();
    session = new TypingSession(
      paragraphElements.map((paragraph) => paragraph.textContent ?? ''),
    );
    mode = 'typing';
    candidate = null;
    startedAt = null;
    composing = false;
    widget.hidePrompt();
    widget.hideOutline();
    widget.hideTypingOverlay();
    widget.showStats({ wpm: 0, cpm: 0, errorRate: 0, elapsedMs: 0 });
    syncTypingLayer();
    focusParagraph(session.snapshot().paragraphIndex);
    widget.capture.focus();
  }

  function exitMode() {
    mode = 'idle';
    candidate = null;
    session = null;
    paragraphElements = [];
    startedAt = null;
    composing = false;
    previewParagraphIndex = null;
    clearParagraphSkipPreview();
    widget.hidePrompt();
    widget.hideOutline();
    widget.hideTypingOverlay();
    widget.hideStats();
    widget.capture.blur();
    clearCapture();
  }

  function clearCapture() {
    widget.capture.value = '';
  }

  function ensureStatsTimer() {
    if (statsTimerId !== null) {
      return;
    }

    statsTimerId = setIntervalFn(() => {
      if (mode === 'typing' && session && startedAt !== null && previewParagraphIndex === null) {
        renderMetrics();
      }

      updateIdleCollapse();
    }, STATS_INTERVAL_MS);
  }

  function updateIdleCollapse() {
    const shouldCollapse =
      mode === 'idle' &&
      !settingsOpen &&
      now() - lastActivityAt >= IDLE_COLLAPSE_MS;
    widget.setIdleCollapsed(shouldCollapse, currentDockEdge);
  }

  function handleDockPointerEnter() {
    touch();
    widget.setExpanded(true);
  }

  function handleDockPointerLeave() {
    if (!settingsOpen && mode === 'idle') {
      widget.setExpanded(false);
    }
  }

  function toggleSettingsPanel(event) {
    event.preventDefault();
    event.stopPropagation();
    touch();
    settingsOpen = !settingsOpen;
    widget.setExpanded(true);

    if (settingsOpen) {
      widget.showSettings(config);
    } else {
      widget.hideSettings();
      if (mode === 'idle') {
        widget.setExpanded(false);
      }
    }
  }

  function handleSettingsClick(event) {
    const target = event.target;
    if (!(target instanceof view.HTMLElement)) {
      return;
    }

    if (target.closest('.te-icon-reset')) {
      event.preventDefault();
      event.stopPropagation();
      touch();
      config = mergeConfig({
        ...config,
        icon: { ...DEFAULT_CONFIG.icon },
      });
      widget.setIcon(config.icon);
      widget.showSettings(config);
      saveConfig();
      return;
    }

    if (!target.closest('.te-settings-close')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    touch();
    settingsOpen = false;
    widget.hideSettings();
    if (mode === 'idle') {
      widget.setExpanded(false);
    }
  }

  function suppressContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    touch();
  }

  function handleKeydown(event) {
    if (event.key === 'Escape' && mode !== 'idle') {
      event.preventDefault();
      event.stopPropagation();
      exitMode();
      return;
    }

    if (mode !== 'typing') {
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      touch();

      if (event.shiftKey) {
        skipCurrentParagraph();
      } else {
        session.skipCharacter();
        syncTypingLayer();
      }
      widget.capture.focus();
      return;
    }

    if (composing || event.isComposing) {
      return;
    }

    const fromCapture = getEventSource(event) === widget.capture;
    const hasShortcutModifier = event.ctrlKey || event.metaKey || event.altKey;

    if (!fromCapture || hasShortcutModifier || !isPermittedTypingKey(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      widget.capture.focus();
    }
  }

  function handleSelectionHover(event) {
    if (mode !== 'selecting') {
      return;
    }

    candidate = findCandidateFromTarget(event.target, { isVisible });
    if (!candidate) {
      widget.hideOutline();
      return;
    }

    widget.showOutline(candidate.getBoundingClientRect());
  }

  function handleSelectionClick(event) {
    if (mode !== 'selecting') {
      return;
    }

    const selected = findCandidateFromTarget(event.target, { isVisible });
    if (!selected) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    touch();
    selectParagraph(selected);
  }

  function handleBeforeInput(event) {
    if (mode !== 'typing' || previewParagraphIndex !== null) {
      return;
    }

    event.preventDefault();
    touch();

    if (composing || event.isComposing) {
      return;
    }

    if (event.inputType === 'deleteContentBackward') {
      session.backspace();
      syncTypingLayer();
      renderMetrics();
      clearCapture();
      return;
    }

    if (event.inputType?.startsWith('insert')) {
      acceptText(event.data ?? '');
      clearCapture();
    }
  }

  function acceptText(text) {
    if (mode !== 'typing' || !text || previewParagraphIndex !== null) {
      return;
    }

    if (startedAt === null) {
      startedAt = now();
    }

    const previousIndex = session.snapshot().paragraphIndex;
    session.typeText(text);
    const nextState = session.snapshot();

    if (!nextState.done && nextState.paragraphIndex !== previousIndex) {
      focusParagraph(nextState.paragraphIndex);
    }

    refreshParagraphs();
    syncTypingLayer();
    renderMetrics();
  }

  function skipCurrentParagraph() {
    if (!session || previewParagraphIndex !== null) {
      return;
    }

    const previousIndex = session.snapshot().paragraphIndex;
    session.skipParagraph();
    previewParagraphIndex = previousIndex;
    syncTypingLayer();
    clearParagraphSkipPreview();
    paragraphSkipTimerId = setTimeoutFn(() => {
      previewParagraphIndex = null;
      paragraphSkipTimerId = null;
      const state = session?.snapshot();
      if (state && !state.done) {
        focusParagraph(state.paragraphIndex);
      }
      syncTypingLayer();
    }, PARAGRAPH_SKIP_PREVIEW_MS);
  }

  function clearParagraphSkipPreview() {
    if (paragraphSkipTimerId !== null) {
      clearTimeoutFn(paragraphSkipTimerId);
      paragraphSkipTimerId = null;
    }
  }

  function focusParagraph(index) {
    if (!config.behavior.followCurrentParagraph) {
      return;
    }

    const target = paragraphElements[index];
    if (target) {
      scrollIntoView(target);
    }
  }

  function refreshParagraphs() {
    if (!session || !session.snapshot().done || paragraphElements.length === 0) {
      return;
    }

    const tail = paragraphElements.at(-1);
    if (!tail?.isConnected) {
      return;
    }

    const discovered = listParagraphsFrom(tail, { isVisible }).slice(1);
    const additions = discovered.filter((element) => !paragraphElements.includes(element));

    if (additions.length === 0) {
      return;
    }

    paragraphElements.push(...additions);
    session.appendParagraphs(additions.map((element) => element.textContent ?? ''));
    focusParagraph(session.snapshot().paragraphIndex);
    syncTypingLayer();
  }

  function renderMetrics() {
    if (!session) {
      return;
    }

    const state = session.snapshot();
    const elapsedMs = startedAt === null ? 0 : Math.max(now() - startedAt, 1);
    widget.showStats({
      ...calculateMetrics({
        typedCount: state.typedCount,
        errorCount: state.errorCount,
        elapsedMs,
      }),
      elapsedMs,
    });
  }

  function syncTypingLayer() {
    if (mode !== 'typing' || !session) {
      widget.hideTypingOverlay();
      return;
    }

    const state = session.snapshot();
    const renderIndex = previewParagraphIndex ?? state.paragraphIndex;
    const target = paragraphElements[renderIndex];

    if (!target) {
      widget.hideTypingOverlay();
      return;
    }

    if (state.done && previewParagraphIndex === null) {
      widget.hideTypingOverlay();
      return;
    }

    const cursorIndex =
      previewParagraphIndex === null && renderIndex === state.paragraphIndex
        ? state.characterIndex
        : null;

    widget.showTypingOverlay(
      target,
      session.getRenderState(renderIndex),
      cursorIndex,
    );
  }

  function beginDrag(event) {
    if (event.button === 2) {
      return;
    }

    touch();
    drag = {
      button: event.button,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };

    widget.button.setPointerCapture?.(event.pointerId);
  }

  function beginStatsDrag(event) {
    if (mode !== 'typing' || event.button === 2) {
      return;
    }

    touch();
    const rect = widget.stats.getBoundingClientRect();
    statsDrag = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    };
    widget.stats.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function moveDrag(event) {
    if (statsDrag && event.pointerId === statsDrag.pointerId) {
      const position = clampFloatingPanelPosition(
        {
          x: event.clientX - statsDrag.offsetX,
          y: event.clientY - statsDrag.offsetY,
        },
        getViewport(),
        {
          width: statsDrag.width,
          height: statsDrag.height,
        },
      );
      widget.setStatsPosition(position);
      return;
    }

    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }

    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.moved ||= Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5;

    if (!drag.moved) {
      return;
    }

    const position = clampPosition(
      {
        x: drag.x - ICON_SIZE / 2,
        y: drag.y - ICON_SIZE / 2,
      },
      getViewport(),
      ICON_SIZE,
      BUTTON_INSET,
    );
    currentDockEdge = getClosestEdge(position, getViewport(), ICON_SIZE, BUTTON_INSET);
    widget.setDockEdge(currentDockEdge);
    widget.setButtonPosition(position);
  }

  function endDrag(event) {
    if (statsDrag && event.pointerId === statsDrag.pointerId) {
      const position = clampFloatingPanelPosition(
        {
          x: event.clientX - statsDrag.offsetX,
          y: event.clientY - statsDrag.offsetY,
        },
        getViewport(),
        {
          width: statsDrag.width,
          height: statsDrag.height,
        },
      );
      widget.setStatsPosition(position);
      saveStatsPosition(position);
      statsDrag = null;
      return;
    }

    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }

    const finished = drag;
    drag = null;

    if (!finished.moved) {
      if (finished.button !== 2) {
        touch();
        enterSelectionMode();
      }
      return;
    }

    const position = snapToNearestEdge(
      {
        x: finished.x - ICON_SIZE / 2,
        y: finished.y - ICON_SIZE / 2,
      },
      getViewport(),
      ICON_SIZE,
      BUTTON_INSET,
    );

    currentDockEdge = getClosestEdge(position, getViewport(), ICON_SIZE, BUTTON_INSET);
    widget.setDockEdge(currentDockEdge);
    widget.setButtonPosition(position);
    saveButtonPosition(position);
  }

  function handleSettingsInput(event) {
    const target = event.target;
    if (!(target instanceof view.HTMLInputElement)) {
      return;
    }

    touch();

    if (target.name === 'te-theme-preset') {
      config = mergeConfig({
        ...config,
        theme: target.value,
        colors: { ...PRESET_THEMES[target.value].colors },
      });
      widget.applyTheme(getEffectiveColors());
      widget.showSettings(config);
      saveConfig();
      return;
    }

    if (target.name === 'followCurrentParagraph') {
      config = mergeConfig({
        ...config,
        behavior: {
          ...config.behavior,
          followCurrentParagraph: target.checked,
        },
      });
      saveConfig();
      return;
    }

    if (target.name === 'followCorrectTextColor') {
      config = mergeConfig({
        ...config,
        behavior: {
          ...config.behavior,
          followCorrectTextColor: target.checked,
        },
      });
      widget.applyTheme(getEffectiveColors());
      widget.showSettings(config);
      syncTypingLayer();
      saveConfig();
      return;
    }

    if (target.name === 'icon-file') {
      const [file] = target.files ?? [];
      if (file) {
        void updateCustomIcon(file);
      }
      return;
    }

    if (target.name.startsWith('color-')) {
      const colorKey = target.name.replace('color-', '');
      config = mergeConfig({
        ...config,
        colors: {
          ...config.colors,
          [colorKey]: target.value,
        },
      });
      widget.applyTheme(getEffectiveColors());
      saveConfig();
    }
  }

  async function updateCustomIcon(file) {
    const dataUrl = await readFileAsDataUrl(file);
    config = mergeConfig({
      ...config,
      icon: {
        type: 'image',
        value: dataUrl,
      },
    });
    widget.setIcon(config.icon);
    widget.showSettings(config);
    saveConfig();
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new view.FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error ?? new Error('读取图标失败'));
      reader.readAsDataURL(file);
    });
  }

  function destroy() {
    exitMode();
    if (statsTimerId !== null) {
      clearIntervalFn(statsTimerId);
      statsTimerId = null;
    }
    observer.disconnect();
    while (cleanups.length > 0) {
      cleanups.pop()();
    }
    widget.destroy();
  }
}

function createNoopApp(document) {
  return {
    capture: document.createElement('textarea'),
    enterSelectionMode() {},
    selectParagraph() {},
    getMode: () => 'idle',
    getSnapshot: () => null,
    destroy() {},
  };
}

function clampFloatingPanelPosition(position, viewport, panel) {
  return {
    x: Math.min(Math.max(position.x, 16), Math.max(viewport.width - panel.width - 16, 16)),
    y: Math.min(Math.max(position.y, 16), Math.max(viewport.height - panel.height - 16, 16)),
  };
}

function getEventSource(event) {
  return event.composedPath?.()[0] ?? event.target;
}

function isPermittedTypingKey(key) {
  return (
    key.length === 1 ||
    key === 'Backspace' ||
    key === 'Shift' ||
    key === 'CapsLock' ||
    key === 'Process' ||
    key === 'Dead' ||
    key === 'Compose'
  );
}
