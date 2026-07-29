export type Size = Readonly<{ width: number; height: number }>;
export type Point = Readonly<{ x: number; y: number }>;
export type ContainedRect = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

export function containRect(viewport: Size, source: Size): ContainedRect {
  for (const value of [
    viewport.width,
    viewport.height,
    source.width,
    source.height,
  ]) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error('INVALID_IMAGE_SIZE');
    }
  }
  const scale = Math.min(
    viewport.width / source.width,
    viewport.height / source.height,
  );
  const width = source.width * scale;
  const height = source.height * scale;
  return {
    left: (viewport.width - width) / 2,
    top: (viewport.height - height) / 2,
    width,
    height,
  };
}

export function normalizeTouch(
  point: Point,
  rect: ContainedRect,
): Point | null {
  if (
    point.x < rect.left ||
    point.y < rect.top ||
    point.x > rect.left + rect.width ||
    point.y > rect.top + rect.height
  ) {
    return null;
  }
  return {
    x: (point.x - rect.left) / rect.width,
    y: (point.y - rect.top) / rect.height,
  };
}
