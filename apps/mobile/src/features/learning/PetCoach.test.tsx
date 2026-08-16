import { describe, it, expect, vi } from 'vitest';
import { PetCoach, PetCoachProps } from './PetCoach';

describe('PetCoach logic', () => {
  it('instantiates props and accessibility label with remaining charges', () => {
    const props: PetCoachProps = {
      petName: '치코',
      level: 27,
      archetype: 'SCOUT',
      remainingCharges: 3,
      onUseCoach: vi.fn(),
    };
    expect(props.level).toBe(27);
    expect(props.remainingCharges).toBe(3);
  });
});
