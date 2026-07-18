import { expect, it, vi } from 'vitest';
import { rotateAfterValidation } from './idempotency-key.js';

it('creates one UUID after successful validation for all publish retries', () => {
  const uuid = vi.fn(() => '123e4567-e89b-42d3-a456-426614174000');
  const retained = rotateAfterValidation(uuid);
  expect(retained).toBe('123e4567-e89b-42d3-a456-426614174000');
  expect(uuid).toHaveBeenCalledOnce();
});
