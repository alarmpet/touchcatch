export type MailAddress = Readonly<{ Address?: string }>;
export type MailSummary = Readonly<{ ID?: string; Created?: string; To?: MailAddress[] }>;

type MailpitPage = Readonly<{ messages?: MailSummary[]; total?: number }>;

export async function findMailpitMessagesByRecipient(
  mailpitUrl: string,
  recipient: string,
  options: Readonly<{
    fetchPage?: (input: string | URL, init?: RequestInit) => Promise<Response>;
    pageSize?: number;
    maxPages?: number;
    timeoutMs?: number;
    timeoutSignal?: (milliseconds: number) => AbortSignal;
  }> = {},
): Promise<MailSummary[]> {
  const pageSize = options.pageSize ?? 100;
  const maxPages = options.maxPages ?? 10;
  const timeoutMs = options.timeoutMs ?? 2_000;
  if (!Number.isInteger(pageSize) || pageSize < 1 || !Number.isInteger(maxPages) || maxPages < 1 || !Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error('LOCAL_SUPABASE_UNAVAILABLE');
  }

  const matches: MailSummary[] = [];
  try {
    for (let page = 0; page < maxPages; page++) {
      const start = page * pageSize;
      const url = new URL('/api/v1/messages', mailpitUrl);
      url.searchParams.set('start', String(start));
      url.searchParams.set('limit', String(pageSize));
      const signal = (options.timeoutSignal ?? AbortSignal.timeout)(timeoutMs);
      const response = await (options.fetchPage ?? fetch)(url, { method: 'GET', signal });
      if (!response.ok) throw new Error('mailpit fetch failed');
      const payload = await response.json() as MailpitPage;
      const messages = Array.isArray(payload.messages) ? payload.messages : [];
      matches.push(...messages.filter((message) => message.To?.some((address) => address.Address === recipient)));
      if (messages.length < pageSize || (typeof payload.total === 'number' && start + messages.length >= payload.total)) break;
    }
    return matches;
  } catch {
    throw new Error('LOCAL_SUPABASE_UNAVAILABLE');
  }
}
