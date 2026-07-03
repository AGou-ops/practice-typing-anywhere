import { PRESET_THEMES } from '../core/config.js';

const BUTTON_OFFSET = 24;
const THEME_VARIABLES = {
  outline: '--te-outline-color',
  pending: '--te-pending-color',
  correct: '--te-correct-color',
  error: '--te-error-color',
  skipped: '--te-skipped-color',
  errorBackground: '--te-error-bg-color',
  statsBackground: '--te-stats-background-color',
  statsText: '--te-stats-text-color',
};

export function createWidget(document) {
  const host = document.createElement('div');
  host.dataset.typingEverywhereUi = 'true';

  const root = host.attachShadow({ mode: 'open' });
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
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: 0;
        border-radius: 999px;
        background: var(--te-outline-color, #1f6feb);
        color: #ffffff;
        box-shadow: 0 10px 25px rgba(15, 23, 42, 0.22);
        font: 600 18px/1 system-ui, sans-serif;
        overflow: hidden;
      }

      .te-start-button img {
        width: 100%;
        height: 100%;
        border-radius: inherit;
        display: block;
        object-fit: cover;
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
        border: 1px solid rgba(3, 252, 11, 0.35);
        border-radius: 14px;
        background: #000000;
        color: #03fc0b;
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

      .te-icon-reset {
        padding: 4px 10px;
        border: 1px solid rgba(15, 23, 42, 0.16);
        border-radius: 999px;
        background: #ffffff;
        color: #111827;
        font: 13px/1.5 system-ui, sans-serif;
        cursor: pointer;
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
      <button class="te-button te-start-button" type="button" aria-label="开始打字练习">🤓</button>
      <button class="te-button te-settings-button" type="button" aria-label="打开设置">⚙</button>
    </div>
    <div class="te-outline"></div>
    <div class="te-typing-layer" aria-hidden="true"></div>
    <div class="te-stats"></div>
    <div class="te-prompt" role="status" aria-live="polite"></div>
    <section class="te-settings" aria-label="打字练习设置"></section>
    <textarea class="te-capture" aria-hidden="true"></textarea>
  `;

  document.documentElement.append(host);

  const dock = root.querySelector('.te-dock');
  const button = root.querySelector('.te-start-button');
  const settingsButton = root.querySelector('.te-settings-button');
  const outline = root.querySelector('.te-outline');
  const typingLayer = root.querySelector('.te-typing-layer');
  const stats = root.querySelector('.te-stats');
  const prompt = root.querySelector('.te-prompt');
  const settings = root.querySelector('.te-settings');
  const capture = root.querySelector('.te-capture');
  const themeTargets = [
    dock,
    button,
    settingsButton,
    outline,
    typingLayer,
    stats,
    prompt,
    settings,
  ];
  let maskedTarget = null;
  let maskedVisibility = '';

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
      dock.style.right = 'auto';
    },
    setDockEdge(edge) {
      dock.dataset.edge = edge;
    },
    setIcon(icon = {}) {
      if (icon.type === 'image' && icon.value) {
        button.innerHTML = `<img alt="" src="${escapeHtml(icon.value)}">`;
        return;
      }

      button.textContent = icon.value || '🤓';
    },
    setExpanded(expanded) {
      dock.dataset.expanded = String(expanded);
    },
    setIdleCollapsed(collapsed, edge = dock.dataset.edge ?? 'right') {
      dock.dataset.edge = edge;
      dock.dataset.collapsed = String(collapsed);
    },
    setStatsPosition({ x, y }) {
      stats.style.left = `${x}px`;
      stats.style.top = `${y}px`;
      stats.style.right = 'auto';
      stats.style.bottom = 'auto';
    },
    resetStatsPosition() {
      stats.style.left = '';
      stats.style.top = '';
      stats.style.right = '16px';
      stats.style.bottom = '16px';
    },
    showOutline(rect) {
      outline.style.display = 'block';
      outline.style.top = `${rect.top}px`;
      outline.style.left = `${rect.left}px`;
      outline.style.width = `${rect.width}px`;
      outline.style.height = `${rect.height}px`;
    },
    hideOutline() {
      outline.style.display = 'none';
    },
    showPrompt(message) {
      prompt.textContent = message;
      prompt.style.display = 'block';
    },
    hidePrompt() {
      prompt.style.display = 'none';
      prompt.textContent = '';
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
      target.style.visibility = 'hidden';
      typingLayer.style.display = 'block';
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
      const cursorPosition = positionCursor(typingLayer, cursorIndex, style.lineHeight);
      if (cursorPosition) {
        capture.style.left = `${Math.round(cursorPosition.left)}px`;
        capture.style.top = `${Math.round(cursorPosition.top + cursorPosition.height + 4)}px`;
      }
    },
    hideTypingOverlay() {
      if (maskedTarget) {
        maskedTarget.style.visibility = maskedVisibility;
        if (maskedTarget.getAttribute('style') === '') {
          maskedTarget.removeAttribute('style');
        }
      }
      maskedTarget = null;
      maskedVisibility = '';
      typingLayer.style.display = 'none';
      typingLayer.innerHTML = '';
      capture.style.left = '';
      capture.style.top = '';
    },
    showStats({ wpm, cpm, errorRate, elapsedMs = 0 }) {
      stats.style.display = 'block';
      stats.textContent =
        `${formatElapsed(elapsedMs)}  ${Math.round(wpm)} WPM  ${Math.round(cpm)} CPM  ${(errorRate * 100).toFixed(1)}%  Esc 退出`;
    },
    hideStats() {
      stats.style.display = 'none';
    },
    showSettings(config = {}) {
      const theme = config.theme ?? 'Classic';
      const colors = config.colors ?? PRESET_THEMES[theme]?.colors ?? PRESET_THEMES.Classic.colors;
      const followCurrentParagraph = config.behavior?.followCurrentParagraph ?? true;
      const followCorrectTextColor = config.behavior?.followCorrectTextColor ?? true;
      const iconType = config.icon?.type ?? 'emoji';
      const iconValue = config.icon?.value ?? '🤓';

      settings.innerHTML = `
        <div class="te-settings-header">
          <h2>设置</h2>
          <button class="te-settings-close" type="button" aria-label="关闭设置">×</button>
        </div>
        <fieldset>
          <legend>主题预设</legend>
          ${Object.keys(PRESET_THEMES)
            .map(
              (presetName) => `
                <label>
                  <input
                    type="radio"
                    name="te-theme-preset"
                    value="${presetName}"
                    ${presetName === theme ? 'checked' : ''}
                  />
                  <span>${presetName}</span>
                </label>
              `,
            )
            .join('')}
        </fieldset>
        <fieldset>
          <legend>入口图标</legend>
          <label>
            <span>当前图标</span>
            <span>${iconType === 'image' ? '本地图标' : escapeHtml(iconValue)}</span>
          </label>
          <label>
            <span>自定义本地图标</span>
            <input type="file" name="icon-file" accept="image/*" />
          </label>
          <button class="te-icon-reset" type="button">恢复默认图标</button>
        </fieldset>
        <fieldset>
          <legend>颜色</legend>
          ${renderColorInput('outline', '框线', colors.outline)}
          ${renderColorInput('pending', '未输入', colors.pending)}
          ${
            followCorrectTextColor
              ? '<label><span>已输入颜色</span><span>跟随原文颜色</span></label>'
              : renderColorInput('correct', '已输入', colors.correct)
          }
          ${renderColorInput('error', '错误字', colors.error)}
          ${renderColorInput('skipped', '跳过字', colors.skipped)}
          ${renderColorInput('errorBackground', '错误背景', colors.errorBackground)}
          ${renderColorInput('statsBackground', '统计背景', colors.statsBackground)}
          ${renderColorInput('statsText', '统计文字', colors.statsText)}
        </fieldset>
        <fieldset>
          <legend>行为</legend>
          <label>
            <input
              type="checkbox"
              name="followCurrentParagraph"
              ${followCurrentParagraph ? 'checked' : ''}
            />
            <span>当前段落跟随滚动</span>
          </label>
          <label>
            <input
              type="checkbox"
              name="followCorrectTextColor"
              ${followCorrectTextColor ? 'checked' : ''}
            />
            <span>已输入颜色跟随原文颜色</span>
          </label>
        </fieldset>
      `;
      settings.style.display = 'block';
    },
    hideSettings() {
      settings.style.display = 'none';
    },
    applyTheme(colors) {
      applyThemeColors(colors, themeTargets);
    },
    destroy() {
      this.hideTypingOverlay();
      host.remove();
    },
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
      `<span class="te-char" data-index="${index}" data-state="${state}">${escapeHtml(text)}</span>`,
    );
  });

  if (cursorIndex !== null) {
    fragments.push(renderCursor(cursorIndex));
  }

  return fragments.join('');
}

function renderCursor(position) {
  return `<span class="te-cursor" data-position="${position}" aria-hidden="true"></span>`;
}

function formatElapsed(elapsedMs = 0) {
  const totalSeconds = Math.max(Math.floor(elapsedMs / 1000), 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function positionCursor(layer, cursorIndex, lineHeightValue) {
  const cursor = layer.querySelector('.te-cursor');
  if (!cursor || cursorIndex === null) {
    return null;
  }

  const layerRect = layer.getBoundingClientRect();
  const chars = [...layer.querySelectorAll('.te-char')];
  const nextChar = chars[cursorIndex] ?? null;
  const previousChar = chars[cursorIndex - 1] ?? null;
  const anchorRect = nextChar?.getBoundingClientRect() ?? previousChar?.getBoundingClientRect();
  const fallbackHeight = parseFloat(lineHeightValue) || parseFloat(layer.style.fontSize) || 16;

  if (!anchorRect) {
    cursor.style.left = '0px';
    cursor.style.top = '0px';
    cursor.style.height = `${fallbackHeight}px`;
    return { left: layerRect.left, top: layerRect.top, height: fallbackHeight };
  }

  const left =
    nextChar !== null
      ? anchorRect.left - layerRect.left
      : anchorRect.right - layerRect.left;
  const top = anchorRect.top - layerRect.top;
  const height = anchorRect.height || fallbackHeight;

  cursor.style.left = `${left}px`;
  cursor.style.top = `${top}px`;
  cursor.style.height = `${height}px`;

  return { left: layerRect.left + left, top: layerRect.top + top, height };
}

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
