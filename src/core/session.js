import { normalizeText, splitCharacters } from './characters.js';

function toParagraphCharacters(value) {
  return splitCharacters(normalizeText(value));
}

export class TypingSession {
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
      done: this.done,
    };
  }

  #advanceParagraph() {
    this.paragraphIndex += 1;
    this.characterIndex = 0;
    this.done = this.paragraphIndex >= this.paragraphs.length;
  }
}
