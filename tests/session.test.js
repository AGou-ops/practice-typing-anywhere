import assert from 'node:assert/strict';
import test from 'node:test';

import { TypingSession } from '../src/core/session.js';

test('错误字符继续前进且退格不撤销累计统计', () => {
  const session = new TypingSession(['ab']);

  session.typeText('x');
  session.backspace();
  session.typeText('a');

  assert.deepEqual(session.snapshot(), {
    paragraphIndex: 0,
    characterIndex: 1,
    typedCount: 2,
    errorCount: 1,
    done: false,
  });
});

test('一次提交多个 IME 字符并自动进入下一段', () => {
  const session = new TypingSession(['中文', '下一段']);

  session.typeText('中文');

  assert.equal(session.snapshot().paragraphIndex, 1);
  assert.equal(session.snapshot().characterIndex, 0);
});

test('最后一段结束后保持等待状态并支持追加后恢复', () => {
  const session = new TypingSession(['A']);

  session.typeText('A');
  assert.deepEqual(session.snapshot(), {
    paragraphIndex: 1,
    characterIndex: 0,
    typedCount: 1,
    errorCount: 0,
    done: true,
  });

  session.typeText('Z');
  assert.equal(session.snapshot().typedCount, 1);

  session.appendParagraphs(['B']);
  assert.deepEqual(session.snapshot(), {
    paragraphIndex: 1,
    characterIndex: 0,
    typedCount: 1,
    errorCount: 0,
    done: false,
  });

  session.typeText('B');
  assert.deepEqual(session.snapshot(), {
    paragraphIndex: 2,
    characterIndex: 0,
    typedCount: 2,
    errorCount: 0,
    done: true,
  });
});
