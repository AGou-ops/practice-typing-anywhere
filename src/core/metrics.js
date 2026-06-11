export function calculateMetrics({ typedCount, errorCount, elapsedMs }) {
  if (typedCount === 0 || elapsedMs <= 0) {
    return { wpm: 0, cpm: 0, errorRate: 0 };
  }

  const minutes = elapsedMs / 60_000;
  return {
    wpm: typedCount / 5 / minutes,
    cpm: typedCount / minutes,
    errorRate: errorCount / typedCount,
  };
}
