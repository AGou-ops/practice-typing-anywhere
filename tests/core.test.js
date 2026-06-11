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
});
