import { describe, expect, it, vi } from 'vitest';
import { findMailpitMessagesByRecipient } from './mailpit-messages.js';

const address = (value: string) => ({ Address: value });
const summary = (id: string, recipient: string) => ({ ID: id, Created: '2026-07-22T00:00:00Z', To: [address(recipient)] });

describe('bounded Mailpit pagination', () => {
  it('finds only the exact recipient beyond one hundred unrelated messages', async () => {
    const recipient = 'owned@example.test';
    const pages = [
      Array.from({ length: 100 }, (_, index) => summary(`noise-${index}`, 'noise@example.test')),
      [summary('owned-message', recipient)],
    ];
    const signal = new AbortController().signal;
    const timeoutSignal = vi.fn(() => signal);
    const fetchPage = vi.fn(async (input: string | URL, init?: RequestInit) => {
      expect(init).toMatchObject({ method: 'GET', signal });
      const start = Number(new URL(input).searchParams.get('start'));
      const messages = pages[start / 100] ?? [];
      return Response.json({ messages, total: 101 });
    });

    const matches = await findMailpitMessagesByRecipient('http://127.0.0.1:55324', recipient, { fetchPage, pageSize: 100, maxPages: 3, timeoutMs: 2_000, timeoutSignal });
    expect(matches.map((message) => message.ID)).toEqual(['owned-message']);
    expect(fetchPage.mock.calls.map(([input]) => new URL(String(input)).searchParams.get('start'))).toEqual(['0', '100']);
    expect(timeoutSignal.mock.calls).toEqual([[2_000], [2_000]]);
  });

  it('stops at the page cap and sanitizes fetch failures', async () => {
    const fullPage = Array.from({ length: 2 }, (_, index) => summary(`noise-${index}`, 'noise@example.test'));
    const fetchPage = vi.fn(async () => Response.json({ messages: fullPage, total: 50 }));
    await expect(findMailpitMessagesByRecipient('http://127.0.0.1:55324', 'owned@example.test', { fetchPage, pageSize: 2, maxPages: 2, timeoutMs: 2_000 })).resolves.toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    await expect(findMailpitMessagesByRecipient('http://127.0.0.1:55324', 'owned@example.test', { fetchPage: async () => { throw new Error('raw-mail-output'); }, pageSize: 100, maxPages: 2, timeoutMs: 2_000 })).rejects.toThrow(/^LOCAL_SUPABASE_UNAVAILABLE$/u);
  });
});
