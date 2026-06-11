import { normalizeText } from './characters.js';

export const PARAGRAPH_SELECTOR = 'p,li,blockquote,pre,figcaption,h1,h2,h3,h4,h5,h6';

const EXCLUDED_SELECTOR = [
  'input',
  'textarea',
  'select',
  'button',
  '[contenteditable]:not([contenteditable="false"])',
  '[aria-hidden="true"]',
  'script',
  'style',
  'noscript',
  '[data-typing-everywhere-ui]',
].join(',');

export function defaultIsVisible(element) {
  const view = element.ownerDocument.defaultView;
  const style = view.getComputedStyle(element);

  return (
    !element.hidden &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    normalizeText(element.textContent ?? '') !== ''
  );
}

export function isValidParagraph(element, { isVisible = defaultIsVisible } = {}) {
  if (!element || !element.matches(PARAGRAPH_SELECTOR)) {
    return false;
  }

  if (element.matches(EXCLUDED_SELECTOR) || element.closest(EXCLUDED_SELECTOR)) {
    return false;
  }

  if (normalizeText(element.textContent ?? '') === '') {
    return false;
  }

  return isVisible(element);
}

export function findCandidateFromTarget(target, options = {}) {
  const view = target?.ownerDocument?.defaultView;
  const element = view && target instanceof view.Element
    ? target
    : target?.parentElement ?? null;
  const candidate = element?.closest(PARAGRAPH_SELECTOR) ?? null;

  return isValidParagraph(candidate, options) ? candidate : null;
}

export function listParagraphsFrom(start, options = {}) {
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
