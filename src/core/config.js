export const PRESET_THEMES = {
  Classic: {
    colors: {
      outline: '#1f6feb',
      pending: '#9ca3af',
      correct: '#111827',
      error: '#111827',
      errorBackground: '#ff7b6b',
      skipped: '#2563eb',
      statsBackground: '#000000',
      statsText: '#00ff51',
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
      statsBackground: '#000000',
      statsText: '#00ff51',
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
      statsBackground: '#000000',
      statsText: '#00ff51',
    },
  },
};

export const DEFAULT_CONFIG = {
  theme: 'Classic',
  icon: {
    type: 'emoji',
    value: '🤓',
  },
  colors: { ...PRESET_THEMES.Classic.colors },
  behavior: {
    followCurrentParagraph: true,
    followCorrectTextColor: true,
  },
};

export function mergeConfig(partial = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...partial,
    icon: {
      ...DEFAULT_CONFIG.icon,
      ...partial.icon,
    },
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
