import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { AccountDeletionCard, type DeletionPhase } from './AccountDeletionCard';

vi.mock('react-native', () => ({ Text: 'Text', View: 'View', Pressable: 'Pressable' }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(phase: DeletionPhase, overrides: Partial<Parameters<typeof AccountDeletionCard>[0]> = {}) {
  const props = {
    phase,
    busy: false,
    purgeFailed: [] as readonly string[],
    onBegin: vi.fn(),
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  };
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<AccountDeletionCard {...props} />); });
  return { tree, props };
}

describe('account deletion card', () => {
  // The screen this replaces deleted on a single unconfirmed tap. Nothing irreversible may be
  // one press away.
  it('does not offer to confirm until the person has asked to start', () => {
    const { tree, props } = render({ kind: 'IDLE' });

    expect(tree.root.findAllByProps({ accessibilityLabel: '계정 삭제 확인' })).toEqual([]);
    act(() => { tree.root.findByProps({ accessibilityLabel: '회원 탈퇴' }).props.onPress(); });
    expect(props.onBegin).toHaveBeenCalledOnce();
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  // Google requires that people be told what to expect before they commit. This card is where
  // that disclosure lives, so its absence is a compliance failure, not a copy tweak.
  it('states what will happen, that it takes time, and that it cannot be undone', () => {
    const { tree } = render({ kind: 'CONFIRMING' });
    const rendered = JSON.stringify(tree.toJSON());

    expect(rendered).toContain('로그인할 수 없어요');
    expect(rendered).toContain('시간이 걸려요');
    expect(rendered).toContain('되돌릴 수 없어요');
    // Match records belong to the opponent too; saying so is the honest description of what
    // actually happens to them.
    expect(rendered).toContain('대전 기록');
  });

  it('confirms only through the explicit second action', () => {
    const { tree, props } = render({ kind: 'CONFIRMING' });

    act(() => { tree.root.findByProps({ accessibilityLabel: '계정 삭제 확인' }).props.onPress(); });
    expect(props.onConfirm).toHaveBeenCalledOnce();

    act(() => { tree.root.findByProps({ accessibilityLabel: '삭제 취소' }).props.onPress(); });
    expect(props.onCancel).toHaveBeenCalledOnce();
  });

  it('says the request is durable so closing the app does not read as cancelling it', () => {
    const { tree } = render({
      kind: 'REQUESTED',
      receipt: { receiptSecret: 'a'.repeat(64), requestId: 'r', createdAt: '2026-08-26T00:00:00Z' },
    });

    expect(JSON.stringify(tree.toJSON())).toContain('앱을 닫아도 계속 처리돼요');
  });

  // A device that could not clear its own stored session must say so. The old path reported
  // success regardless, which told people their data was gone while tokens sat on disk.
  it('admits when local sign-in data could not be cleared', () => {
    const { tree } = render({
      kind: 'REQUESTED',
      receipt: { receiptSecret: 'a'.repeat(64), requestId: 'r', createdAt: '2026-08-26T00:00:00Z' },
    }, { purgeFailed: ['session'] });

    expect(JSON.stringify(tree.toJSON())).toContain('완전히 지우지 못했어요');
  });

  it('never renders the receipt secret', () => {
    const secret = 'b'.repeat(64);
    const { tree } = render({
      kind: 'REQUESTED',
      receipt: { receiptSecret: secret, requestId: 'r', createdAt: '2026-08-26T00:00:00Z' },
    });

    expect(JSON.stringify(tree.toJSON())).not.toContain(secret);
  });
});
