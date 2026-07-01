// ==UserScript==
// @name         Typing Everywhere
// @namespace    https://github.com/local/typing-everywhere
// @version      0.1.0
// @description  在普通网页文本上进行非侵入式连续打字练习
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(() => {
  // src/core/config.js
  var PRESET_THEMES = {
    Classic: {
      colors: {
        outline: "#1f6feb",
        pending: "#9ca3af",
        correct: "#111827",
        error: "#111827",
        errorBackground: "#ff7b6b",
        skipped: "#2563eb",
        statsBackground: "#000000",
        statsText: "#00ff51"
      }
    },
    Soft: {
      colors: {
        outline: "#7c8aa5",
        pending: "#b6bcc8",
        correct: "#1f2937",
        error: "#ffffff",
        errorBackground: "#d97706",
        skipped: "#6d28d9",
        statsBackground: "#000000",
        statsText: "#00ff51"
      }
    },
    HighContrast: {
      colors: {
        outline: "#00b7ff",
        pending: "#8b95a7",
        correct: "#000000",
        error: "#ffffff",
        errorBackground: "#dc2626",
        skipped: "#0f766e",
        statsBackground: "#000000",
        statsText: "#00ff51"
      }
    }
  };
  var DEFAULT_CONFIG = {
    theme: "Classic",
    icon: {
      type: "emoji",
      value: "\u{1F913}"
    },
    colors: { ...PRESET_THEMES.Classic.colors },
    behavior: {
      followCurrentParagraph: true,
      followCorrectTextColor: true
    }
  };
  function mergeConfig(partial = {}) {
    return {
      ...DEFAULT_CONFIG,
      ...partial,
      icon: {
        ...DEFAULT_CONFIG.icon,
        ...partial.icon
      },
      colors: {
        ...DEFAULT_CONFIG.colors,
        ...partial.colors
      },
      behavior: {
        ...DEFAULT_CONFIG.behavior,
        ...partial.behavior
      }
    };
  }

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
  function clampPosition(position, viewport, size, inset = 0) {
    return {
      x: Math.min(
        Math.max(position.x, inset),
        Math.max(viewport.width - size - inset, inset)
      ),
      y: Math.min(
        Math.max(position.y, inset),
        Math.max(viewport.height - size - inset, inset)
      )
    };
  }
  function getClosestEdge(position, viewport, size, inset = 0) {
    const clamped = clampPosition(position, viewport, size, inset);
    const distances = [
      ["left", clamped.x - inset],
      ["right", viewport.width - size - inset - clamped.x],
      ["top", clamped.y - inset],
      ["bottom", viewport.height - size - inset - clamped.y]
    ];
    return distances.reduce((best, item) => item[1] < best[1] ? item : best)[0];
  }
  function snapToNearestEdge(position, viewport, size, inset = 0) {
    const clamped = clampPosition(position, viewport, size, inset);
    const edge = getClosestEdge(position, viewport, size, inset);
    if (edge === "left") {
      return { ...clamped, x: inset };
    }
    if (edge === "right") {
      return { ...clamped, x: viewport.width - size - inset };
    }
    if (edge === "top") {
      return { ...clamped, y: inset };
    }
    return { ...clamped, y: viewport.height - size - inset };
  }

  // src/core/session.js
  function toParagraphCharacters(value) {
    return splitCharacters(normalizeText(value));
  }
  var TypingSession = class {
    constructor(paragraphs) {
      this.paragraphs = paragraphs.map(toParagraphCharacters);
      this.entries = this.paragraphs.map((paragraph) => paragraph.map(() => null));
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
        const correct = character === expected;
        this.typedCount += 1;
        if (!correct) {
          this.errorCount += 1;
        }
        this.entries[this.paragraphIndex][this.characterIndex] = {
          value: character,
          correct
        };
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
      this.entries[this.paragraphIndex][this.characterIndex] = null;
    }
    skipCharacter() {
      if (this.done) {
        return null;
      }
      const paragraphIndex = this.paragraphIndex;
      const currentParagraph = this.paragraphs[paragraphIndex];
      this.entries[paragraphIndex][this.characterIndex] = {
        value: currentParagraph[this.characterIndex],
        correct: false,
        skipped: true
      };
      this.characterIndex += 1;
      if (this.characterIndex >= currentParagraph.length) {
        this.#advanceParagraph();
      }
      return this.getRenderState(paragraphIndex);
    }
    skipParagraph() {
      if (this.done) {
        return [];
      }
      const paragraphIndex = this.paragraphIndex;
      const currentParagraph = this.paragraphs[paragraphIndex];
      while (!this.done && this.paragraphIndex === paragraphIndex) {
        if (this.entries[paragraphIndex][this.characterIndex] === null) {
          this.entries[paragraphIndex][this.characterIndex] = {
            value: currentParagraph[this.characterIndex],
            correct: false,
            skipped: true
          };
        }
        this.characterIndex += 1;
        if (this.characterIndex >= currentParagraph.length) {
          this.#advanceParagraph();
        }
      }
      return this.getRenderState(paragraphIndex);
    }
    appendParagraphs(paragraphs) {
      const nextParagraphs = paragraphs.map(toParagraphCharacters);
      this.paragraphs.push(...nextParagraphs);
      this.entries.push(...nextParagraphs.map((paragraph) => paragraph.map(() => null)));
      if (this.done && this.paragraphIndex < this.paragraphs.length) {
        this.done = false;
      }
    }
    getRenderState(index = this.paragraphIndex) {
      const paragraph = this.paragraphs[index] ?? [];
      const entries = this.entries[index] ?? [];
      return paragraph.map((expected, position) => {
        const entry = entries[position];
        if (!entry) {
          return { text: expected, state: "pending" };
        }
        if (entry.skipped) {
          return { text: entry.value, state: "skipped" };
        }
        return {
          text: entry.value,
          state: entry.correct ? "correct" : "error"
        };
      });
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
  var BUTTON_OFFSET = 24;
  var THEME_VARIABLES = {
    outline: "--te-outline-color",
    pending: "--te-pending-color",
    correct: "--te-correct-color",
    error: "--te-error-color",
    skipped: "--te-skipped-color",
    errorBackground: "--te-error-bg-color",
    statsBackground: "--te-stats-background-color",
    statsText: "--te-stats-text-color"
  };
  function createWidget(document2) {
    const host = document2.createElement("div");
    host.dataset.typingEverywhereUi = "true";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
    <style>
      :host {
        all: initial;
      }

      .te-dock,
      .te-outline,
      .te-typing-layer,
      .te-stats,
      .te-prompt,
      .te-settings,
      .te-capture {
        box-sizing: border-box;
        position: fixed;
        z-index: 2147483647;
      }

      .te-dock {
        top: ${BUTTON_OFFSET}px;
        right: ${BUTTON_OFFSET}px;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: transform 180ms ease, opacity 180ms ease;
      }

      .te-dock[data-edge="left"],
      .te-dock[data-edge="right"] {
        flex-direction: column;
      }

      .te-dock[data-edge="top"],
      .te-dock[data-edge="bottom"] {
        flex-direction: row;
      }

      .te-dock[data-collapsed="true"][data-edge="right"] {
        transform: translateX(calc(100% - 14px));
      }

      .te-dock[data-collapsed="true"][data-edge="left"] {
        transform: translateX(calc(-100% + 58px));
      }

      .te-dock[data-collapsed="true"][data-edge="top"] {
        transform: translateY(calc(-100% + 14px));
      }

      .te-dock[data-collapsed="true"][data-edge="bottom"] {
        transform: translateY(calc(100% - 14px));
      }

      .te-button {
        width: 44px;
        height: 44px;
        border: 0;
        border-radius: 999px;
        background: var(--te-outline-color, #1f6feb);
        color: #ffffff;
        box-shadow: 0 10px 25px rgba(15, 23, 42, 0.22);
        font: 600 18px/1 system-ui, sans-serif;
      }

      .te-start-button img {
        width: 28px;
        height: 28px;
        object-fit: contain;
        pointer-events: none;
      }

      .te-start-button {
        cursor: grab;
      }

      .te-start-button:active {
        cursor: grabbing;
      }

      .te-settings-button {
        display: none;
        cursor: pointer;
        font-size: 16px;
      }

      .te-dock[data-expanded="true"] .te-settings-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .te-outline {
        display: none;
        border: 2px solid var(--te-outline-color, #1f6feb);
        border-radius: 6px;
        pointer-events: none;
      }

      .te-typing-layer {
        display: none;
        pointer-events: none;
        position: fixed;
        white-space: pre-wrap;
        overflow: hidden;
      }

      .te-char[data-state="pending"] {
        color: var(--te-pending-color, #9ca3af);
      }

      .te-char[data-state="correct"] {
        color: var(--te-correct-color, currentColor);
      }

      .te-char[data-state="error"] {
        color: var(--te-error-color, #111827);
        background: var(--te-error-bg-color, #ff7b6b);
      }

      .te-char[data-state="skipped"] {
        color: var(--te-skipped-color, #2563eb);
        text-decoration: underline;
        text-decoration-style: dashed;
      }

      .te-cursor {
        position: absolute;
        width: 0;
        border-left: 2px solid currentColor;
        animation: te-blink 1s steps(1, end) infinite;
      }

      @keyframes te-blink {
        0%,
        49% {
          opacity: 1;
        }

        50%,
        100% {
          opacity: 0;
        }
      }

      .te-stats {
        right: 16px;
        bottom: 16px;
        display: none;
        padding: 12px 14px;
        border-radius: 10px;
        background: var(--te-stats-background-color, #000000);
        color: var(--te-stats-text-color, #00ff51);
        font: 13px/1.4 system-ui, sans-serif;
        white-space: pre;
      }

      .te-prompt {
        top: 50%;
        left: 50%;
        display: none;
        min-width: 260px;
        max-width: min(520px, calc(100vw - 32px));
        padding: 16px 20px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 14px;
        background: rgba(23, 25, 31, 0.92);
        color: #ffffff;
        font: 15px/1.5 system-ui, sans-serif;
        text-align: center;
        transform: translate(-50%, -50%);
      }

      .te-settings {
        top: 72px;
        right: 16px;
        display: none;
        width: min(340px, calc(100vw - 32px));
        max-height: calc(100vh - 96px);
        overflow: auto;
        padding: 16px;
        border: 1px solid rgba(15, 23, 42, 0.12);
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.98);
        color: #111827;
        font: 13px/1.5 system-ui, sans-serif;
        box-shadow: 0 20px 45px rgba(15, 23, 42, 0.16);
      }

      .te-settings-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }

      .te-settings h2 {
        margin: 0;
        font: 600 14px/1.4 system-ui, sans-serif;
      }

      .te-settings-close {
        width: 28px;
        height: 28px;
        border: 0;
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.08);
        color: #111827;
        font: 600 16px/1 system-ui, sans-serif;
        cursor: pointer;
      }

      .te-settings fieldset {
        margin: 0 0 14px;
        padding: 0;
        border: 0;
      }

      .te-settings legend {
        margin-bottom: 8px;
        font-weight: 600;
      }

      .te-settings label {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0 0 8px;
      }

      .te-settings label:last-child {
        margin-bottom: 0;
      }

      .te-settings label.color {
        justify-content: space-between;
      }

      .te-settings input[type="color"] {
        width: 44px;
        height: 28px;
        padding: 0;
        border: 0;
        background: transparent;
      }

      .te-capture {
        top: 0;
        left: -10000px;
        width: 1px;
        height: 1px;
        opacity: 0;
      }
    </style>
    <div class="te-dock" data-expanded="false" data-collapsed="false" data-edge="right">
      <button class="te-button te-start-button" type="button" aria-label="\u5F00\u59CB\u6253\u5B57\u7EC3\u4E60">\u{1F913}</button>
      <button class="te-button te-settings-button" type="button" aria-label="\u6253\u5F00\u8BBE\u7F6E">\u2699</button>
    </div>
    <div class="te-outline"></div>
    <div class="te-typing-layer" aria-hidden="true"></div>
    <div class="te-stats"></div>
    <div class="te-prompt" role="status" aria-live="polite"></div>
    <section class="te-settings" aria-label="\u6253\u5B57\u7EC3\u4E60\u8BBE\u7F6E"></section>
    <textarea class="te-capture" aria-hidden="true"></textarea>
  `;
    document2.documentElement.append(host);
    const dock = root.querySelector(".te-dock");
    const button = root.querySelector(".te-start-button");
    const settingsButton = root.querySelector(".te-settings-button");
    const outline = root.querySelector(".te-outline");
    const typingLayer = root.querySelector(".te-typing-layer");
    const stats = root.querySelector(".te-stats");
    const prompt = root.querySelector(".te-prompt");
    const settings = root.querySelector(".te-settings");
    const capture = root.querySelector(".te-capture");
    const themeTargets = [
      dock,
      button,
      settingsButton,
      outline,
      typingLayer,
      stats,
      prompt,
      settings
    ];
    let maskedTarget = null;
    let maskedVisibility = "";
    applyThemeColors(PRESET_THEMES.Classic.colors, themeTargets);
    return {
      host,
      dock,
      button,
      startButton: button,
      settingsButton,
      settings,
      stats,
      capture,
      setButtonPosition({ x, y }) {
        dock.style.left = `${x}px`;
        dock.style.top = `${y}px`;
        dock.style.right = "auto";
      },
      setDockEdge(edge) {
        dock.dataset.edge = edge;
      },
      setIcon(icon = {}) {
        if (icon.type === "image" && icon.value) {
          button.innerHTML = `<img alt="" src="${escapeHtml(icon.value)}">`;
          return;
        }
        button.textContent = icon.value || "\u{1F913}";
      },
      setExpanded(expanded) {
        dock.dataset.expanded = String(expanded);
      },
      setIdleCollapsed(collapsed, edge = dock.dataset.edge ?? "right") {
        dock.dataset.edge = edge;
        dock.dataset.collapsed = String(collapsed);
      },
      setStatsPosition({ x, y }) {
        stats.style.left = `${x}px`;
        stats.style.top = `${y}px`;
        stats.style.right = "auto";
        stats.style.bottom = "auto";
      },
      resetStatsPosition() {
        stats.style.left = "";
        stats.style.top = "";
        stats.style.right = "16px";
        stats.style.bottom = "16px";
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
      showPrompt(message) {
        prompt.textContent = message;
        prompt.style.display = "block";
      },
      hidePrompt() {
        prompt.style.display = "none";
        prompt.textContent = "";
      },
      showTypingOverlay(target, characters, cursorIndex = null) {
        if (maskedTarget && maskedTarget !== target) {
          this.hideTypingOverlay();
        }
        if (!maskedTarget) {
          maskedTarget = target;
          maskedVisibility = target.style.visibility;
        }
        const rect = target.getBoundingClientRect();
        const style = target.ownerDocument.defaultView.getComputedStyle(target);
        target.style.visibility = "hidden";
        typingLayer.style.display = "block";
        typingLayer.style.top = `${rect.top}px`;
        typingLayer.style.left = `${rect.left}px`;
        typingLayer.style.width = `${rect.width}px`;
        typingLayer.style.height = `${rect.height}px`;
        typingLayer.style.font = style.font;
        typingLayer.style.fontFamily = style.fontFamily;
        typingLayer.style.fontSize = style.fontSize;
        typingLayer.style.fontWeight = style.fontWeight;
        typingLayer.style.fontStyle = style.fontStyle;
        typingLayer.style.lineHeight = style.lineHeight;
        typingLayer.style.letterSpacing = style.letterSpacing;
        typingLayer.style.wordSpacing = style.wordSpacing;
        typingLayer.style.textAlign = style.textAlign;
        typingLayer.style.textTransform = style.textTransform;
        typingLayer.style.color = style.color;
        typingLayer.style.padding = style.padding;
        typingLayer.innerHTML = renderCharacters(characters, cursorIndex);
        positionCursor(typingLayer, cursorIndex, style.lineHeight);
      },
      hideTypingOverlay() {
        if (maskedTarget) {
          maskedTarget.style.visibility = maskedVisibility;
          if (maskedTarget.getAttribute("style") === "") {
            maskedTarget.removeAttribute("style");
          }
        }
        maskedTarget = null;
        maskedVisibility = "";
        typingLayer.style.display = "none";
        typingLayer.innerHTML = "";
      },
      showStats({ wpm, cpm, errorRate, elapsedMs = 0 }) {
        stats.style.display = "block";
        stats.textContent = `${formatElapsed(elapsedMs)}  ${Math.round(wpm)} WPM  ${Math.round(cpm)} CPM  ${(errorRate * 100).toFixed(1)}%  Esc \u9000\u51FA`;
      },
      hideStats() {
        stats.style.display = "none";
      },
      showSettings(config = {}) {
        const theme = config.theme ?? "Classic";
        const colors = config.colors ?? PRESET_THEMES[theme]?.colors ?? PRESET_THEMES.Classic.colors;
        const followCurrentParagraph = config.behavior?.followCurrentParagraph ?? true;
        const followCorrectTextColor = config.behavior?.followCorrectTextColor ?? true;
        const iconType = config.icon?.type ?? "emoji";
        const iconValue = config.icon?.value ?? "\u{1F913}";
        settings.innerHTML = `
        <div class="te-settings-header">
          <h2>\u8BBE\u7F6E</h2>
          <button class="te-settings-close" type="button" aria-label="\u5173\u95ED\u8BBE\u7F6E">\xD7</button>
        </div>
        <fieldset>
          <legend>\u4E3B\u9898\u9884\u8BBE</legend>
          ${Object.keys(PRESET_THEMES).map(
          (presetName) => `
                <label>
                  <input
                    type="radio"
                    name="te-theme-preset"
                    value="${presetName}"
                    ${presetName === theme ? "checked" : ""}
                  />
                  <span>${presetName}</span>
                </label>
              `
        ).join("")}
        </fieldset>
        <fieldset>
          <legend>\u5165\u53E3\u56FE\u6807</legend>
          <label>
            <span>\u5F53\u524D\u56FE\u6807</span>
            <span>${iconType === "image" ? "\u672C\u5730\u56FE\u6807" : escapeHtml(iconValue)}</span>
          </label>
          <label>
            <span>\u81EA\u5B9A\u4E49\u672C\u5730\u56FE\u6807</span>
            <input type="file" name="icon-file" accept="image/*" />
          </label>
        </fieldset>
        <fieldset>
          <legend>\u989C\u8272</legend>
          ${renderColorInput("outline", "\u6846\u7EBF", colors.outline)}
          ${renderColorInput("pending", "\u672A\u8F93\u5165", colors.pending)}
          ${followCorrectTextColor ? "<label><span>\u5DF2\u8F93\u5165\u989C\u8272</span><span>\u8DDF\u968F\u539F\u6587\u989C\u8272</span></label>" : renderColorInput("correct", "\u5DF2\u8F93\u5165", colors.correct)}
          ${renderColorInput("error", "\u9519\u8BEF\u5B57", colors.error)}
          ${renderColorInput("skipped", "\u8DF3\u8FC7\u5B57", colors.skipped)}
          ${renderColorInput("errorBackground", "\u9519\u8BEF\u80CC\u666F", colors.errorBackground)}
          ${renderColorInput("statsBackground", "\u7EDF\u8BA1\u80CC\u666F", colors.statsBackground)}
          ${renderColorInput("statsText", "\u7EDF\u8BA1\u6587\u5B57", colors.statsText)}
        </fieldset>
        <fieldset>
          <legend>\u884C\u4E3A</legend>
          <label>
            <input
              type="checkbox"
              name="followCurrentParagraph"
              ${followCurrentParagraph ? "checked" : ""}
            />
            <span>\u5F53\u524D\u6BB5\u843D\u8DDF\u968F\u6EDA\u52A8</span>
          </label>
          <label>
            <input
              type="checkbox"
              name="followCorrectTextColor"
              ${followCorrectTextColor ? "checked" : ""}
            />
            <span>\u5DF2\u8F93\u5165\u989C\u8272\u8DDF\u968F\u539F\u6587\u989C\u8272</span>
          </label>
        </fieldset>
      `;
        settings.style.display = "block";
      },
      hideSettings() {
        settings.style.display = "none";
      },
      applyTheme(colors) {
        applyThemeColors(colors, themeTargets);
      },
      destroy() {
        this.hideTypingOverlay();
        host.remove();
      }
    };
  }
  function renderColorInput(name, label, value) {
    return `
    <label class="color">
      <span>${label}</span>
      <input type="color" name="color-${name}" value="${value}" />
    </label>
  `;
  }
  function applyThemeColors(colors, targets) {
    for (const [key, variableName] of Object.entries(THEME_VARIABLES)) {
      if (!Object.hasOwn(colors, key)) {
        continue;
      }
      for (const target of targets) {
        target.style.setProperty(variableName, colors[key]);
      }
    }
  }
  function renderCharacters(characters, cursorIndex) {
    const fragments = [];
    characters.forEach(({ text, state }, index) => {
      fragments.push(
        `<span class="te-char" data-index="${index}" data-state="${state}">${escapeHtml(text)}</span>`
      );
    });
    if (cursorIndex !== null) {
      fragments.push(renderCursor(cursorIndex));
    }
    return fragments.join("");
  }
  function renderCursor(position) {
    return `<span class="te-cursor" data-position="${position}" aria-hidden="true"></span>`;
  }
  function formatElapsed(elapsedMs = 0) {
    const totalSeconds = Math.max(Math.floor(elapsedMs / 1e3), 0);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor(totalSeconds % 3600 / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  function positionCursor(layer, cursorIndex, lineHeightValue) {
    const cursor = layer.querySelector(".te-cursor");
    if (!cursor || cursorIndex === null) {
      return;
    }
    const layerRect = layer.getBoundingClientRect();
    const chars = [...layer.querySelectorAll(".te-char")];
    const nextChar = chars[cursorIndex] ?? null;
    const previousChar = chars[cursorIndex - 1] ?? null;
    const anchorRect = nextChar?.getBoundingClientRect() ?? previousChar?.getBoundingClientRect();
    const fallbackHeight = parseFloat(lineHeightValue) || parseFloat(layer.style.fontSize) || 16;
    if (!anchorRect) {
      cursor.style.left = "0px";
      cursor.style.top = "0px";
      cursor.style.height = `${fallbackHeight}px`;
      return;
    }
    const left = nextChar !== null ? anchorRect.left - layerRect.left : anchorRect.right - layerRect.left;
    const top = anchorRect.top - layerRect.top;
    const height = anchorRect.height || fallbackHeight;
    cursor.style.left = `${left}px`;
    cursor.style.top = `${top}px`;
    cursor.style.height = `${height}px`;
  }
  function escapeHtml(text) {
    return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }

  // src/app.js
  var ICON_SIZE = 44;
  var BUTTON_INSET = 24;
  var POSITION_KEY = "typing-everywhere-position";
  var CONFIG_KEY = "typing-everywhere-config";
  var STATS_POSITION_KEY = "typing-everywhere-stats-position";
  var STATS_INTERVAL_MS = 250;
  var IDLE_COLLAPSE_MS = 5 * 60 * 1e3;
  var PARAGRAPH_SKIP_PREVIEW_MS = 600;
  function createTypingApp({
    document: document2,
    now = () => Date.now(),
    isVisible = defaultIsVisible,
    scrollIntoView = (element) => {
      element.scrollIntoView?.({ behavior: "smooth", block: "center" });
    },
    setIntervalFn = (callback, delay) => document2.defaultView.setInterval(callback, delay),
    clearIntervalFn = (timerId) => document2.defaultView.clearInterval(timerId),
    setTimeoutFn = (callback, delay) => document2.defaultView.setTimeout(callback, delay),
    clearTimeoutFn = (timerId) => document2.defaultView.clearTimeout(timerId)
  } = {}) {
    const view = document2.defaultView;
    if (view.top !== view.self || document2.querySelector("[data-typing-everywhere-ui]")) {
      return createNoopApp(document2);
    }
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
    let statsDrag = null;
    let currentDockEdge = "right";
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
    listen(widget.button, "pointerdown", beginDrag);
    listen(widget.button, "contextmenu", suppressContextMenu);
    listen(widget.settingsButton, "click", toggleSettingsPanel);
    listen(widget.settingsButton, "contextmenu", suppressContextMenu);
    listen(widget.dock, "pointerenter", handleDockPointerEnter);
    listen(widget.dock, "pointerleave", handleDockPointerLeave);
    listen(widget.stats, "pointerdown", beginStatsDrag);
    listen(document2, "pointermove", moveDrag, true);
    listen(document2, "pointerup", endDrag, true);
    listen(document2, "pointermove", handleSelectionHover, true);
    listen(document2, "click", handleSelectionClick, true);
    listen(document2, "keydown", handleKeydown, true);
    listen(view, "scroll", syncTypingLayer, true);
    listen(view, "resize", syncTypingLayer);
    listen(widget.capture, "beforeinput", handleBeforeInput);
    listen(widget.capture, "compositionstart", () => {
      composing = true;
      touch();
    });
    listen(widget.capture, "compositionend", (event) => {
      composing = false;
      touch();
      acceptText(event.data ?? "");
      clearCapture();
    });
    listen(widget.settings, "input", handleSettingsInput);
    listen(widget.settings, "change", handleSettingsInput);
    listen(widget.settings, "click", handleSettingsClick);
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
          correct: "currentColor"
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
            y: saved.yRatio * view.innerHeight
          },
          getViewport(),
          ICON_SIZE,
          BUTTON_INSET
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
            y: saved.yRatio * view.innerHeight
          },
          getViewport(),
          defaultRect
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
          yRatio: position.y / Math.max(view.innerHeight, 1)
        })
      );
    }
    function saveButtonPosition(position) {
      view.localStorage.setItem(
        POSITION_KEY,
        JSON.stringify({
          edge: currentDockEdge,
          xRatio: position.x / Math.max(view.innerWidth, 1),
          yRatio: position.y / Math.max(view.innerHeight, 1)
        })
      );
    }
    function enterSelectionMode() {
      exitMode();
      touch();
      mode = "selecting";
      settingsOpen = false;
      widget.hideSettings();
      widget.setExpanded(true);
      widget.showPrompt("\u8BF7\u9009\u62E9\u4E00\u6BB5\u6587\u672C\uFF0CEsc \u9000\u51FA");
    }
    function selectParagraph(element) {
      paragraphElements = listParagraphsFrom(element, { isVisible });
      if (paragraphElements.length === 0) {
        exitMode();
        return;
      }
      clearParagraphSkipPreview();
      session = new TypingSession(
        paragraphElements.map((paragraph) => paragraph.textContent ?? "")
      );
      mode = "typing";
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
      mode = "idle";
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
      widget.capture.value = "";
    }
    function ensureStatsTimer() {
      if (statsTimerId !== null) {
        return;
      }
      statsTimerId = setIntervalFn(() => {
        if (mode === "typing" && session && startedAt !== null && previewParagraphIndex === null) {
          renderMetrics();
        }
        updateIdleCollapse();
      }, STATS_INTERVAL_MS);
    }
    function updateIdleCollapse() {
      const shouldCollapse = mode === "idle" && !settingsOpen && now() - lastActivityAt >= IDLE_COLLAPSE_MS;
      widget.setIdleCollapsed(shouldCollapse, currentDockEdge);
    }
    function handleDockPointerEnter() {
      touch();
      widget.setExpanded(true);
    }
    function handleDockPointerLeave() {
      if (!settingsOpen && mode === "idle") {
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
        if (mode === "idle") {
          widget.setExpanded(false);
        }
      }
    }
    function handleSettingsClick(event) {
      const target = event.target;
      if (!(target instanceof view.HTMLElement)) {
        return;
      }
      if (!target.closest(".te-settings-close")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      touch();
      settingsOpen = false;
      widget.hideSettings();
      if (mode === "idle") {
        widget.setExpanded(false);
      }
    }
    function suppressContextMenu(event) {
      event.preventDefault();
      event.stopPropagation();
      touch();
    }
    function handleKeydown(event) {
      if (event.key === "Escape" && mode !== "idle") {
        event.preventDefault();
        event.stopPropagation();
        exitMode();
        return;
      }
      if (mode !== "typing") {
        return;
      }
      if (event.key === "Tab") {
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
      touch();
      selectParagraph(selected);
    }
    function handleBeforeInput(event) {
      if (mode !== "typing" || previewParagraphIndex !== null) {
        return;
      }
      event.preventDefault();
      touch();
      if (composing || event.isComposing) {
        return;
      }
      if (event.inputType === "deleteContentBackward") {
        session.backspace();
        syncTypingLayer();
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
      if (mode !== "typing" || !text || previewParagraphIndex !== null) {
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
      session.appendParagraphs(additions.map((element) => element.textContent ?? ""));
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
          elapsedMs
        }),
        elapsedMs
      });
    }
    function syncTypingLayer() {
      if (mode !== "typing" || !session) {
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
      const cursorIndex = previewParagraphIndex === null && renderIndex === state.paragraphIndex ? state.characterIndex : null;
      widget.showTypingOverlay(
        target,
        session.getRenderState(renderIndex),
        cursorIndex
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
        moved: false
      };
      widget.button.setPointerCapture?.(event.pointerId);
    }
    function beginStatsDrag(event) {
      if (mode !== "typing" || event.button === 2) {
        return;
      }
      touch();
      const rect = widget.stats.getBoundingClientRect();
      statsDrag = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        width: rect.width,
        height: rect.height
      };
      widget.stats.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    }
    function moveDrag(event) {
      if (statsDrag && event.pointerId === statsDrag.pointerId) {
        const position2 = clampFloatingPanelPosition(
          {
            x: event.clientX - statsDrag.offsetX,
            y: event.clientY - statsDrag.offsetY
          },
          getViewport(),
          {
            width: statsDrag.width,
            height: statsDrag.height
          }
        );
        widget.setStatsPosition(position2);
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
          y: drag.y - ICON_SIZE / 2
        },
        getViewport(),
        ICON_SIZE,
        BUTTON_INSET
      );
      currentDockEdge = getClosestEdge(position, getViewport(), ICON_SIZE, BUTTON_INSET);
      widget.setDockEdge(currentDockEdge);
      widget.setButtonPosition(position);
    }
    function endDrag(event) {
      if (statsDrag && event.pointerId === statsDrag.pointerId) {
        const position2 = clampFloatingPanelPosition(
          {
            x: event.clientX - statsDrag.offsetX,
            y: event.clientY - statsDrag.offsetY
          },
          getViewport(),
          {
            width: statsDrag.width,
            height: statsDrag.height
          }
        );
        widget.setStatsPosition(position2);
        saveStatsPosition(position2);
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
          y: finished.y - ICON_SIZE / 2
        },
        getViewport(),
        ICON_SIZE,
        BUTTON_INSET
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
      if (target.name === "te-theme-preset") {
        config = mergeConfig({
          ...config,
          theme: target.value,
          colors: { ...PRESET_THEMES[target.value].colors }
        });
        widget.applyTheme(getEffectiveColors());
        widget.showSettings(config);
        saveConfig();
        return;
      }
      if (target.name === "followCurrentParagraph") {
        config = mergeConfig({
          ...config,
          behavior: {
            ...config.behavior,
            followCurrentParagraph: target.checked
          }
        });
        saveConfig();
        return;
      }
      if (target.name === "followCorrectTextColor") {
        config = mergeConfig({
          ...config,
          behavior: {
            ...config.behavior,
            followCorrectTextColor: target.checked
          }
        });
        widget.applyTheme(getEffectiveColors());
        widget.showSettings(config);
        syncTypingLayer();
        saveConfig();
        return;
      }
      if (target.name === "icon-file") {
        const [file] = target.files ?? [];
        if (file) {
          void updateCustomIcon(file);
        }
        return;
      }
      if (target.name.startsWith("color-")) {
        const colorKey = target.name.replace("color-", "");
        config = mergeConfig({
          ...config,
          colors: {
            ...config.colors,
            [colorKey]: target.value
          }
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
          type: "image",
          value: dataUrl
        }
      });
      widget.setIcon(config.icon);
      widget.showSettings(config);
      saveConfig();
    }
    function readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new view.FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error ?? new Error("\u8BFB\u53D6\u56FE\u6807\u5931\u8D25"));
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
  function createNoopApp(document2) {
    return {
      capture: document2.createElement("textarea"),
      enterSelectionMode() {
      },
      selectParagraph() {
      },
      getMode: () => "idle",
      getSnapshot: () => null,
      destroy() {
      }
    };
  }
  function clampFloatingPanelPosition(position, viewport, panel) {
    return {
      x: Math.min(Math.max(position.x, 16), Math.max(viewport.width - panel.width - 16, 16)),
      y: Math.min(Math.max(position.y, 16), Math.max(viewport.height - panel.height - 16, 16))
    };
  }
  function getEventSource(event) {
    return event.composedPath?.()[0] ?? event.target;
  }
  function isPermittedTypingKey(key) {
    return key.length === 1 || key === "Backspace" || key === "Shift" || key === "CapsLock" || key === "Process" || key === "Dead" || key === "Compose";
  }

  // src/typing-everywhere.user.js
  createTypingApp({ document });
})();
