export function normalizeText(value) {
  return value.replace(/\s+/gu, ' ').trim();
}

export function splitCharacters(value) {
  return Array.from(value);
}
