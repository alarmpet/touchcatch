import { describe, expect, it } from 'vitest';
import { parseMatchCommandV1 } from './match.schema';

describe('match command schema', () => {
  it('accepts a namespaced player command and rejects a future revision shape', () => {
    const command = {
      source: 'PLAYER', commandId: '00000000-0000-4000-8000-000000000001:player:p1:00000000-0000-4000-8000-000000000002',
      matchId: '00000000-0000-4000-8000-000000000001', commandSeq: 1, receivedAtMs: 0,
      requestId: '00000000-0000-4000-8000-000000000002', playerId: 'p1', expectedRevision: 0,
      payload: { type: 'TAP_IMAGE', imageSide: 'A', x: 0.5, y: 0.5 },
    };
    expect(parseMatchCommandV1(command)).toEqual(command);
    expect(() => parseMatchCommandV1({ ...command, extra: true })).toThrow();
    expect(() => parseMatchCommandV1({ ...command, requestId: '00000000-0000-1000-8000-000000000002' })).toThrow();
  });
});
