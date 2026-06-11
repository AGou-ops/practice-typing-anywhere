const BUTTON_OFFSET = 16;

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
    <button class="te-button" type="button" aria-label="开始打字练习">⌨</button>
    <div class="te-outline"></div>
    <div class="te-stats"></div>
    <textarea class="te-capture" aria-hidden="true"></textarea>
  `;

  document.documentElement.append(host);

  const button = root.querySelector('.te-button');
  const outline = root.querySelector('.te-outline');
  const stats = root.querySelector('.te-stats');
  const capture = root.querySelector('.te-capture');

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
    showStats({ wpm, cpm, errorRate }) {
      stats.style.display = 'block';
      stats.textContent = `${Math.round(wpm)} WPM  ${Math.round(cpm)} CPM  ${(errorRate * 100).toFixed(1)}%  Esc 退出`;
    },
    hideStats() {
      stats.style.display = 'none';
    },
    destroy() {
      host.remove();
    },
  };
}
