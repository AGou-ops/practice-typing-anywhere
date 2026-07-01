import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_CONFIG,
  PRESET_THEMES,
  mergeConfig,
} from '../src/core/config.js';
import { normalizeText, splitCharacters } from '../src/core/characters.js';
import { calculateMetrics } from '../src/core/metrics.js';
import { clampPosition, snapToNearestEdge } from '../src/core/position.js';

test('归一化空白并按 Unicode 字符拆分', () => {
  assert.equal(normalizeText('  中文\n  A  '), '中文 A');
  assert.deepEqual(splitCharacters('A😀中'), ['A', '😀', '中']);
});

test('根据累计输入计算 WPM、CPM 和错误率', () => {
  assert.deepEqual(
    calculateMetrics({ typedCount: 50, errorCount: 5, elapsedMs: 60_000 }),
    { wpm: 10, cpm: 50, errorRate: 0.1 },
  );
  assert.deepEqual(
    calculateMetrics({ typedCount: 0, errorCount: 0, elapsedMs: 0 }),
    { wpm: 0, cpm: 0, errorRate: 0 },
  );
});

test('图标保持在视口内并吸附最近边缘', () => {
  assert.deepEqual(
    clampPosition({ x: 990, y: -20 }, { width: 1000, height: 800 }, 40),
    { x: 960, y: 0 },
  );
  assert.deepEqual(
    snapToNearestEdge({ x: 900, y: 300 }, { width: 1000, height: 800 }, 40),
    { x: 960, y: 300 },
  );
  assert.deepEqual(
    snapToNearestEdge({ x: 200, y: 10 }, { width: 1000, height: 800 }, 40),
    { x: 200, y: 0 },
  );
  assert.deepEqual(
    snapToNearestEdge({ x: 200, y: 790 }, { width: 1000, height: 800 }, 40),
    { x: 200, y: 760 },
  );
});

test('合并部分配置时保留默认主题和行为开关', () => {
  assert.equal(PRESET_THEMES.Classic.colors.pending, '#9ca3af');
  assert.equal(PRESET_THEMES.Classic.colors.statsBackground, '#000000');
  assert.equal(PRESET_THEMES.Classic.colors.statsText, '#00ff51');
  assert.equal(DEFAULT_CONFIG.icon.type, 'emoji');
  assert.equal(DEFAULT_CONFIG.icon.value, '🤓');
  assert.equal(DEFAULT_CONFIG.behavior.followCorrectTextColor, true);
  assert.deepEqual(
    mergeConfig({
      colors: { error: '#ff0000' },
      icon: { type: 'image', value: 'data:image/png;base64,xxx' },
      behavior: {
        followCurrentParagraph: false,
        followCorrectTextColor: false,
      },
    }),
    {
      ...DEFAULT_CONFIG,
      icon: {
        type: 'image',
        value: 'data:image/png;base64,xxx',
      },
      colors: {
        ...DEFAULT_CONFIG.colors,
        error: '#ff0000',
      },
      behavior: {
        ...DEFAULT_CONFIG.behavior,
        followCurrentParagraph: false,
        followCorrectTextColor: false,
      },
    },
  );
});
