import { describe, expect, it } from 'vitest';
import { containRect, normalizeTouch } from './geometry.js';

describe('contained image geometry', () => {
  it('computes horizontal letterboxing', () => {
    expect(containRect(
      { width: 360, height: 360 },
      { width: 600, height: 400 },
    )).toEqual({ left: 0, top: 60, width: 360, height: 240 });
  });

  it('computes vertical letterboxing', () => {
    expect(containRect(
      { width: 400, height: 200 },
      { width: 100, height: 100 },
    )).toEqual({ left: 100, top: 0, width: 200, height: 200 });
  });

  it('ignores touches in contain padding', () => {
    const rect = { left: 0, top: 60, width: 360, height: 240 };
    expect(normalizeTouch({ x: 180, y: 30 }, rect)).toBeNull();
  });

  it('normalizes a touch inside the image', () => {
    const rect = { left: 0, top: 60, width: 360, height: 240 };
    expect(normalizeTouch({ x: 180, y: 180 }, rect)).toEqual({ x: .5, y: .5 });
  });

  it.each([
    [{ width: 0, height: 100 }, { width: 600, height: 400 }],
    [{ width: 100, height: 100 }, { width: 0, height: 400 }],
    [{ width: Number.NaN, height: 100 }, { width: 600, height: 400 }],
  ])('rejects invalid dimensions', (viewport, source) => {
    expect(() => containRect(viewport, source)).toThrow('INVALID_IMAGE_SIZE');
  });
});
