export const PRESET_THEMES = {
  Classic: {
    colors: {
      outline: '#1f6feb',
      pending: '#9ca3af',
      correct: '#111827',
      error: '#111827',
      errorBackground: '#ff7b6b',
      skipped: '#2563eb',
    },
  },
  Soft: {
    colors: {
      outline: '#7c8aa5',
      pending: '#b6bcc8',
      correct: '#1f2937',
      error: '#ffffff',
      errorBackground: '#d97706',
      skipped: '#6d28d9',
    },
  },
  HighContrast: {
    colors: {
      outline: '#00b7ff',
      pending: '#8b95a7',
      correct: '#000000',
      error: '#ffffff',
      errorBackground: '#dc2626',
      skipped: '#0f766e',
    },
  },
};

export const DEFAULT_CONFIG = {
  theme: 'Classic',
  colors: { ...PRESET_THEMES.Classic.colors },
  behavior: {
    followCurrentParagraph: true,
  },
};

export function mergeConfig(partial = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...partial,
    colors: {
      ...DEFAULT_CONFIG.colors,
      ...partial.colors,
    },
    behavior: {
      ...DEFAULT_CONFIG.behavior,
      ...partial.behavior,
    },
  };
}
