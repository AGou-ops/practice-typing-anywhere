// ==UserScript==
// @name         Typing Everywhere
// @namespace    https://github.com/local/typing-everywhere
// @version      0.1.0
// @description  在普通网页文本上进行非侵入式连续打字练习
// @match        *://*/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  // src/core/metrics.js
  function calculateMetrics({ typedCount, errorCount, elapsedMs }) {
    if (typedCount === 0 || elapsedMs <= 0) {
      return { wpm: 0, cpm: 0, errorRate: 0 };
    }
    const minutes = elapsedMs / 6e4;
    return {
      wpm: typedCount / 5 / minutes,
      cpm: typedCount / minutes,
      errorRate: errorCount / typedCount
    };
  }

  // src/core/characters.js
  function normalizeText(value) {
    return value.replace(/\s+/gu, " ").trim();
  }
  function splitCharacters(value) {
    return Array.from(value);
  }

  // src/core/paragraphs.js
  var PARAGRAPH_SELECTOR = "p,li,blockquote,pre,figcaption,h1,h2,h3,h4,h5,h6";
  var EXCLUDED_SELECTOR = [
    "input",
    "textarea",
    "select",
    "button",
    '[contenteditable]:not([contenteditable="false"])',
    '[aria-hidden="true"]',
    "script",
    "style",
    "noscript",
    "[data-typing-everywhere-ui]"
  ].join(",");
  function defaultIsVisible(element) {
    const view = element.ownerDocument.defaultView;
    const style = view.getComputedStyle(element);
    return !element.hidden && style.display !== "none" && style.visibility !== "hidden" && normalizeText(element.textContent ?? "") !== "";
  }
  function isValidParagraph(element, { isVisible = defaultIsVisible } = {}) {
    if (!element || !element.matches(PARAGRAPH_SELECTOR)) {
      return false;
    }
    if (element.matches(EXCLUDED_SELECTOR) || element.closest(EXCLUDED_SELECTOR)) {
      return false;
    }
    if (normalizeText(element.textContent ?? "") === "") {
      return false;
    }
    return isVisible(element);
  }
  function findCandidateFromTarget(target, options = {}) {
    const view = target?.ownerDocument?.defaultView;
    const element = view && target instanceof view.Element ? target : target?.parentElement ?? null;
    const candidate = element?.closest(PARAGRAPH_SELECTOR) ?? null;
    return isValidParagraph(candidate, options) ? candidate : null;
  }
  function listParagraphsFrom(start, options = {}) {
    if (!isValidParagraph(start, options)) {
      return [];
    }
    const paragraphs = [...start.ownerDocument.querySelectorAll(PARAGRAPH_SELECTOR)];
    const startIndex = paragraphs.indexOf(start);
    if (startIndex === -1) {
      return [];
    }
    return paragraphs.slice(startIndex).filter((element) => isValidParagraph(element, options));
  }

  // src/core/position.js
  function clampPosition(position, viewport, size) {
    return {
      x: Math.min(Math.max(position.x, 0), Math.max(viewport.width - size, 0)),
      y: Math.min(Math.max(position.y, 0), Math.max(viewport.height - size, 0))
    };
  }
  function snapToNearestEdge(position, viewport, size) {
    const clamped = clampPosition(position, viewport, size);
    const distances = [
      ["left", clamped.x],
      ["right", viewport.width - size - clamped.x],
      ["top", clamped.y],
      ["bottom", viewport.height - size - clamped.y]
    ];
    const [edge] = distances.reduce((best, item) => item[1] < best[1] ? item : best);
    if (edge === "left") {
      return { ...clamped, x: 0 };
    }
    if (edge === "right") {
      return { ...clamped, x: viewport.width - size };
    }
    if (edge === "top") {
      return { ...clamped, y: 0 };
    }
    return { ...clamped, y: viewport.height - size };
  }

  // src/core/session.js
  function toParagraphCharacters(value) {
    return splitCharacters(normalizeText(value));
  }
  var TypingSession = class {
    constructor(paragraphs) {
      this.paragraphs = paragraphs.map(toParagraphCharacters);
      this.paragraphIndex = 0;
      this.characterIndex = 0;
      this.typedCount = 0;
      this.errorCount = 0;
      this.done = this.paragraphs.length === 0;
    }
    typeText(value) {
      for (const character of splitCharacters(value)) {
        if (this.done) {
          break;
        }
        const currentParagraph = this.paragraphs[this.paragraphIndex];
        const expected = currentParagraph[this.characterIndex];
        this.typedCount += 1;
        if (character !== expected) {
          this.errorCount += 1;
        }
        this.characterIndex += 1;
        if (this.characterIndex >= currentParagraph.length) {
          this.#advanceParagraph();
        }
      }
    }
    backspace() {
      if (this.done || this.characterIndex === 0) {
        return;
      }
      this.characterIndex -= 1;
    }
    appendParagraphs(paragraphs) {
      this.paragraphs.push(...paragraphs.map(toParagraphCharacters));
      if (this.done && this.paragraphIndex < this.paragraphs.length) {
        this.done = false;
      }
    }
    snapshot() {
      return {
        paragraphIndex: this.paragraphIndex,
        characterIndex: this.characterIndex,
        typedCount: this.typedCount,
        errorCount: this.errorCount,
        done: this.done
      };
    }
    #advanceParagraph() {
      this.paragraphIndex += 1;
      this.characterIndex = 0;
      this.done = this.paragraphIndex >= this.paragraphs.length;
    }
  };

  // src/ui/widget.js
  var BUTTON_OFFSET = 16;
  function createWidget(document2) {
    const host = document2.createElement("div");
    host.dataset.typingEverywhereUi = "true";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
    <style>
      :host {
        all: initial;
      }

      .te-button,
      .te-outline,
      .te-stats,
      .te-capture {
        box-sizing: border-box;
        position: fixed;
        z-index: 2147483647;
      }

      .te-button {
        top: ${BUTTON_OFFSET}px;
        right: ${BUTTON_OFFSET}px;
        width: 44px;
        height: 44px;
        border: 0;
        border-radius: 999px;
        background: #1f6feb;
        color: #ffffff;
        cursor: grab;
        font: 600 18px/1 system-ui, sans-serif;
      }

      .te-outline {
        display: none;
        border: 2px solid #1f6feb;
        border-radius: 6px;
        pointer-events: none;
      }

      .te-stats {
        right: 16px;
        bottom: 16px;
        display: none;
        padding: 12px 14px;
        border-radius: 10px;
        background: #17191f;
        color: #ffffff;
        font: 13px/1.4 system-ui, sans-serif;
        white-space: pre;
      }

      .te-capture {
        top: 0;
        left: -10000px;
        width: 1px;
        height: 1px;
        opacity: 0;
      }
    </style>
    <button class="te-button" type="button" aria-label="\u5F00\u59CB\u6253\u5B57\u7EC3\u4E60">\u2328</button>
    <div class="te-outline"></div>
    <div class="te-stats"></div>
    <textarea class="te-capture" aria-hidden="true"></textarea>
  `;
    document2.documentElement.append(host);
    const button = root.querySelector(".te-button");
    const outline = root.querySelector(".te-outline");
    const stats = root.querySelector(".te-stats");
    const capture = root.querySelector(".te-capture");
    return {
      host,
      button,
      capture,
      setButtonPosition({ x, y }) {
        button.style.left = `${x}px`;
        button.style.top = `${y}px`;
        button.style.right = "auto";
      },
      showOutline(rect) {
        outline.style.display = "block";
        outline.style.top = `${rect.top}px`;
        outline.style.left = `${rect.left}px`;
        outline.style.width = `${rect.width}px`;
        outline.style.height = `${rect.height}px`;
      },
      hideOutline() {
        outline.style.display = "none";
      },
      showStats({ wpm, cpm, errorRate }) {
        stats.style.display = "block";
        stats.textContent = `${Math.round(wpm)} WPM  ${Math.round(cpm)} CPM  ${(errorRate * 100).toFixed(1)}%  Esc \u9000\u51FA`;
      },
      hideStats() {
        stats.style.display = "none";
      },
      destroy() {
        host.remove();
      }
    };
  }

  // src/app.js
  var ICON_SIZE = 44;
  var POSITION_KEY = "typing-everywhere-position";
  function createTypingApp({
    document: document2,
    now = () => Date.now(),
    isVisible = defaultIsVisible,
    scrollIntoView = (element) => {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  } = {}) {
    const view = document2.defaultView;
    const widget = createWidget(document2);
    const cleanups = [];
    const observer = new view.MutationObserver(() => {
      refreshParagraphs();
    });
    observer.observe(document2.body, { childList: true, subtree: true });
    let mode = "idle";
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
    listen(widget.button, "pointerdown", beginDrag);
    listen(document2, "pointermove", moveDrag, true);
    listen(document2, "pointerup", endDrag, true);
    listen(document2, "pointermove", handleSelectionHover, true);
    listen(document2, "click", handleSelectionClick, true);
    listen(document2, "keydown", handleKeydown, true);
    listen(widget.capture, "beforeinput", handleBeforeInput);
    listen(widget.capture, "compositionstart", () => {
      composing = true;
    });
    listen(widget.capture, "compositionend", (event) => {
      composing = false;
      acceptText(event.data ?? "");
      clearCapture();
    });
    return {
      capture: widget.capture,
      enterSelectionMode,
      selectParagraph,
      getMode: () => mode,
      getSnapshot: () => session?.snapshot() ?? null,
      destroy
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
            y: saved.yRatio * view.innerHeight
          },
          getViewport(),
          ICON_SIZE
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
          yRatio: position.y / Math.max(view.innerHeight, 1)
        })
      );
    }
    function enterSelectionMode() {
      exitMode();
      mode = "selecting";
    }
    function selectParagraph(element) {
      paragraphElements = listParagraphsFrom(element, { isVisible });
      if (paragraphElements.length === 0) {
        exitMode();
        return;
      }
      session = new TypingSession(
        paragraphElements.map((paragraph) => paragraph.textContent ?? "")
      );
      mode = "typing";
      candidate = null;
      startedAt = null;
      composing = false;
      widget.hideOutline();
      widget.showStats({ wpm: 0, cpm: 0, errorRate: 0 });
      widget.capture.focus();
    }
    function exitMode() {
      mode = "idle";
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
      widget.capture.value = "";
    }
    function handleKeydown(event) {
      if (event.key === "Escape" && mode !== "idle") {
        event.preventDefault();
        exitMode();
      }
    }
    function handleSelectionHover(event) {
      if (mode !== "selecting") {
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
      if (mode !== "selecting") {
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
      if (mode !== "typing") {
        return;
      }
      event.preventDefault();
      if (composing || event.isComposing) {
        return;
      }
      if (event.inputType === "deleteContentBackward") {
        session.backspace();
        renderMetrics();
        clearCapture();
        return;
      }
      if (event.inputType?.startsWith("insert")) {
        acceptText(event.data ?? "");
        clearCapture();
      }
    }
    function acceptText(text) {
      if (mode !== "typing" || !text) {
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
      session.appendParagraphs(additions.map((element) => element.textContent ?? ""));
      scrollIntoView(additions[0]);
    }
    function renderMetrics() {
      const state = session.snapshot();
      const elapsedMs = startedAt === null ? 0 : Math.max(now() - startedAt, 1);
      widget.showStats(
        calculateMetrics({
          typedCount: state.typedCount,
          errorCount: state.errorCount,
          elapsedMs
        })
      );
    }
    function beginDrag(event) {
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        moved: false
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
            y: drag.y - ICON_SIZE / 2
          },
          getViewport(),
          ICON_SIZE
        )
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
          y: finished.y - ICON_SIZE / 2
        },
        getViewport(),
        ICON_SIZE
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

  // src/typing-everywhere.user.js
  createTypingApp({ document });
})();
