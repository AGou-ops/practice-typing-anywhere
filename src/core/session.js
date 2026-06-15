import { normalizeText, splitCharacters } from './characters.js';

function toParagraphCharacters(value) {
  return splitCharacters(normalizeText(value));
}

export class TypingSession {
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
        correct,
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
      skipped: true,
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
          skipped: true,
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
        return { text: expected, state: 'pending' };
      }
      if (entry.skipped) {
        return { text: entry.value, state: 'skipped' };
      }

      return {
        text: entry.value,
        state: entry.correct ? 'correct' : 'error',
      };
    });
  }

  snapshot() {
    return {
      paragraphIndex: this.paragraphIndex,
      characterIndex: this.characterIndex,
      typedCount: this.typedCount,
      errorCount: this.errorCount,
      done: this.done,
    };
  }

  #advanceParagraph() {
    this.paragraphIndex += 1;
    this.characterIndex = 0;
    this.done = this.paragraphIndex >= this.paragraphs.length;
  }
}
