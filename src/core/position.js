export function clampPosition(position, viewport, size, inset = 0) {
  return {
    x: Math.min(
      Math.max(position.x, inset),
      Math.max(viewport.width - size - inset, inset),
    ),
    y: Math.min(
      Math.max(position.y, inset),
      Math.max(viewport.height - size - inset, inset),
    ),
  };
}

export function getClosestEdge(position, viewport, size, inset = 0) {
  const clamped = clampPosition(position, viewport, size, inset);
  const distances = [
    ['left', clamped.x - inset],
    ['right', viewport.width - size - inset - clamped.x],
    ['top', clamped.y - inset],
    ['bottom', viewport.height - size - inset - clamped.y],
  ];

  return distances.reduce((best, item) => (item[1] < best[1] ? item : best))[0];
}

export function snapToNearestEdge(position, viewport, size, inset = 0) {
  const clamped = clampPosition(position, viewport, size, inset);
  const edge = getClosestEdge(position, viewport, size, inset);

  if (edge === 'left') {
    return { ...clamped, x: inset };
  }

  if (edge === 'right') {
    return { ...clamped, x: viewport.width - size - inset };
  }

  if (edge === 'top') {
    return { ...clamped, y: inset };
  }

  return { ...clamped, y: viewport.height - size - inset };
}
