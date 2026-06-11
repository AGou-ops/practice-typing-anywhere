export function clampPosition(position, viewport, size) {
  return {
    x: Math.min(Math.max(position.x, 0), Math.max(viewport.width - size, 0)),
    y: Math.min(Math.max(position.y, 0), Math.max(viewport.height - size, 0)),
  };
}

export function snapToNearestEdge(position, viewport, size) {
  const clamped = clampPosition(position, viewport, size);
  const distances = [
    ['left', clamped.x],
    ['right', viewport.width - size - clamped.x],
    ['top', clamped.y],
    ['bottom', viewport.height - size - clamped.y],
  ];
  const [edge] = distances.reduce((best, item) => (item[1] < best[1] ? item : best));

  if (edge === 'left') {
    return { ...clamped, x: 0 };
  }

  if (edge === 'right') {
    return { ...clamped, x: viewport.width - size };
  }

  if (edge === 'top') {
    return { ...clamped, y: 0 };
  }

  return { ...clamped, y: viewport.height - size };
}
