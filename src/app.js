import { calculateMetrics } from './core/metrics.js';
import {
  defaultIsVisible,
  findCandidateFromTarget,
  listParagraphsFrom,
} from './core/paragraphs.js';
import { clampPosition, snapToNearestEdge } from './core/position.js';
import { TypingSession } from './core/session.js';
import { createWidget } from './ui/widget.js';

const ICON_SIZE = 44;
const POSITION_KEY = 'typing-everywhere-position';

export function createTypingApp({
  document,
  now = () => Date.now(),
  isVisible = defaultIsVisible,
  scrollIntoView = (element) => {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },
} = {}) {
  const view = document.defaultView;
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

  widget.hideOutline();
  widget.hideStats();
  clearCapture();
  restoreButtonPosition();

  listen(widget.button, 'pointerdown', beginDrag);
  listen(document, 'pointermove', moveDrag, true);
  listen(document, 'pointerup', endDrag, true);
  listen(document, 'pointermove', handleSelectionHover, true);
  listen(document, 'click', handleSelectionClick, true);
  listen(document, 'keydown', handleKeydown, true);
  listen(widget.capture, 'beforeinput', handleBeforeInput);
  listen(widget.capture, 'compositionstart', () => {
    composing = true;
  });
  listen(widget.capture, 'compositionend', (event) => {
    composing = false;
    acceptText(event.data ?? '');
    clearCapture();
  });

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

  function getViewport() {
    return { width: view.innerWidth, height: view.innerHeight };
  }

  function restoreButtonPosition() {
    const raw = view.localStorage.getItem(POSITION_KEY);

    if (!raw) {
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
      );
      widget.setButtonPosition(position);
    } catch {
      view.localStorage.removeItem(POSITION_KEY);
    }
  }

  function saveButtonPosition(position) {
    view.localStorage.setItem(
      POSITION_KEY,
      JSON.stringify({
        xRatio: position.x / Math.max(view.innerWidth, 1),
        yRatio: position.y / Math.max(view.innerHeight, 1),
      }),
    );
  }

  function enterSelectionMode() {
    exitMode();
    mode = 'selecting';
  }

  function selectParagraph(element) {
    paragraphElements = listParagraphsFrom(element, { isVisible });

    if (paragraphElements.length === 0) {
      exitMode();
      return;
    }

    session = new TypingSession(
      paragraphElements.map((paragraph) => paragraph.textContent ?? ''),
    );
    mode = 'typing';
    candidate = null;
    startedAt = null;
    composing = false;
    widget.hideOutline();
    widget.showStats({ wpm: 0, cpm: 0, errorRate: 0 });
    widget.capture.focus();
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

  function clearCapture() {
    widget.capture.value = '';
  }

  function handleKeydown(event) {
    if (event.key === 'Escape' && mode !== 'idle') {
      event.preventDefault();
      exitMode();
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
    selectParagraph(selected);
  }

  function handleBeforeInput(event) {
    if (mode !== 'typing') {
      return;
    }

    event.preventDefault();

    if (composing || event.isComposing) {
      return;
    }

    if (event.inputType === 'deleteContentBackward') {
      session.backspace();
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
    if (mode !== 'typing' || !text) {
      return;
    }

    if (startedAt === null) {
      startedAt = now();
    }

    const previousIndex = session.snapshot().paragraphIndex;
    session.typeText(text);
    const nextState = session.snapshot();

    if (!nextState.done && nextState.paragraphIndex !== previousIndex) {
      scrollIntoView(paragraphElements[nextState.paragraphIndex]);
    }

    refreshParagraphs();
    renderMetrics();
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
    scrollIntoView(additions[0]);
  }

  function renderMetrics() {
    const state = session.snapshot();
    const elapsedMs = startedAt === null ? 0 : Math.max(now() - startedAt, 1);

    widget.showStats(
      calculateMetrics({
        typedCount: state.typedCount,
        errorCount: state.errorCount,
        elapsedMs,
      }),
    );
  }

  function beginDrag(event) {
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };

    widget.button.setPointerCapture?.(event.pointerId);
  }

  function moveDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }

    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.moved ||= Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5;

    if (!drag.moved) {
      return;
    }

    widget.setButtonPosition(
      clampPosition(
        {
          x: drag.x - ICON_SIZE / 2,
          y: drag.y - ICON_SIZE / 2,
        },
        getViewport(),
        ICON_SIZE,
      ),
    );
  }

  function endDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }

    const finished = drag;
    drag = null;

    if (!finished.moved) {
      enterSelectionMode();
      return;
    }

    const position = snapToNearestEdge(
      {
        x: finished.x - ICON_SIZE / 2,
        y: finished.y - ICON_SIZE / 2,
      },
      getViewport(),
      ICON_SIZE,
    );

    widget.setButtonPosition(position);
    saveButtonPosition(position);
  }

  function destroy() {
    exitMode();
    observer.disconnect();
    while (cleanups.length > 0) {
      cleanups.pop()();
    }
    widget.destroy();
  }
}
