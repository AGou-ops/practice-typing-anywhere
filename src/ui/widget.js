import { PRESET_THEMES } from '../core/config.js';

const BUTTON_OFFSET = 16;
const THEME_VARIABLES = {
  outline: '--te-outline-color',
  pending: '--te-pending-color',
  correct: '--te-correct-color',
  error: '--te-error-color',
  errorBackground: '--te-error-bg-color',
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

      .te-button,
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

      .te-button {
        top: ${BUTTON_OFFSET}px;
        right: ${BUTTON_OFFSET}px;
        width: 44px;
        height: 44px;
        border: 0;
        border-radius: 999px;
        background: var(--te-outline-color, #1f6feb);
        color: #ffffff;
        cursor: grab;
        font: 600 18px/1 system-ui, sans-serif;
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
        white-space: pre-wrap;
        overflow: hidden;
      }

      .te-char[data-state="pending"] {
        color: var(--te-pending-color, #9ca3af);
      }

      .te-char[data-state="correct"] {
        color: var(--te-correct-color, inherit);
      }

      .te-char[data-state="error"] {
        color: var(--te-error-color, #111827);
        background: var(--te-error-bg-color, #ff7b6b);
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

      .te-prompt {
        top: 50%;
        left: 50%;
        display: none;
        min-width: 220px;
        max-width: min(480px, calc(100vw - 32px));
        padding: 16px 20px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 14px;
        background: rgba(23, 25, 31, 0.92);
        color: #ffffff;
        font: 14px/1.5 system-ui, sans-serif;
        text-align: center;
        transform: translate(-50%, -50%);
      }

      .te-settings {
        top: 72px;
        right: 16px;
        display: none;
        width: min(320px, calc(100vw - 32px));
        padding: 16px;
        border: 1px solid rgba(15, 23, 42, 0.12);
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.98);
        color: #111827;
        font: 13px/1.5 system-ui, sans-serif;
        box-shadow: 0 20px 45px rgba(15, 23, 42, 0.16);
      }

      .te-settings h2 {
        margin: 0 0 12px;
        font: 600 14px/1.4 system-ui, sans-serif;
      }

      .te-settings fieldset {
        margin: 0 0 12px;
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

      .te-capture {
        top: 0;
        left: -10000px;
        width: 1px;
        height: 1px;
        opacity: 0;
      }
    </style>
    <button class="te-button" type="button" aria-label="开始打字练习">⌨</button>
    <div class="te-outline"></div>
    <div class="te-typing-layer" aria-hidden="true"></div>
    <div class="te-stats"></div>
    <div class="te-prompt" role="status" aria-live="polite"></div>
    <section class="te-settings" aria-label="打字练习设置"></section>
    <textarea class="te-capture" aria-hidden="true"></textarea>
  `;

  document.documentElement.append(host);

  const button = root.querySelector('.te-button');
  const outline = root.querySelector('.te-outline');
  const typingLayer = root.querySelector('.te-typing-layer');
  const stats = root.querySelector('.te-stats');
  const prompt = root.querySelector('.te-prompt');
  const settings = root.querySelector('.te-settings');
  const capture = root.querySelector('.te-capture');
  const themeTargets = [button, outline, typingLayer, stats, prompt, settings];
  let maskedTarget = null;
  let maskedVisibility = '';

  applyThemeColors(PRESET_THEMES.Classic.colors, themeTargets);

  return {
    host,
    button,
    capture,
    setButtonPosition({ x, y }) {
      button.style.left = `${x}px`;
      button.style.top = `${y}px`;
      button.style.right = 'auto';
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
    showTypingOverlay(target, characters) {
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
      typingLayer.innerHTML = characters
        .map(
          ({ text, state }) =>
            `<span class="te-char" data-state="${state}">${escapeHtml(text)}</span>`,
        )
        .join('');
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
    },
    showStats({ wpm, cpm, errorRate }) {
      stats.style.display = 'block';
      stats.textContent = `${Math.round(wpm)} WPM  ${Math.round(cpm)} CPM  ${(errorRate * 100).toFixed(1)}%  Esc 退出`;
    },
    hideStats() {
      stats.style.display = 'none';
    },
    showSettings(config = {}) {
      const theme = config.theme ?? 'Classic';
      const followCurrentParagraph =
        config.behavior?.followCurrentParagraph ?? true;

      settings.innerHTML = `
        <h2>设置</h2>
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
          <legend>行为</legend>
          <label>
            <input
              type="checkbox"
              name="followCurrentParagraph"
              ${followCurrentParagraph ? 'checked' : ''}
            />
            <span>followCurrentParagraph</span>
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

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
