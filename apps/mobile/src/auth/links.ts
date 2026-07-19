export function consumeOAuthLinks<T>(
  linking: Readonly<{
    getInitialURL(): Promise<string | null>;
    addEventListener(type: 'url', listener: (event: { url: string }) => void): { remove(): void };
  }>,
  complete: (url: string) => Promise<T>,
  callbacks: Readonly<{ onResult?(result: T): void; onError?(code: 'AUTH_CALLBACK_FAILED'): void }> = {},
) {
  let active = true;
  const consume = (url: string | null) => {
    if (active && url) void complete(url).then((result) => callbacks.onResult?.(result)).catch(() => callbacks.onError?.('AUTH_CALLBACK_FAILED'));
  };
  void linking.getInitialURL().then(consume);
  const subscription = linking.addEventListener('url', ({ url }) => consume(url));
  return () => { active = false; subscription.remove(); };
}

export function captureRecoveryLinks(linking: Readonly<{
  getInitialURL(): Promise<string | null>;
  addEventListener(type: 'url', listener: (event: { url: string }) => void): { remove(): void };
}>, onCapture?: (url: string) => void) {
  let latest: string | null = null;
  const capture = (raw: string | null) => {
    if (!raw) return;
    try { const url = new URL(raw); if (url.protocol === 'spotlearn:' && url.hostname === 'auth' && url.pathname === '/recovery' && !url.hash) { latest = raw; onCapture?.(raw); } } catch { /* Ignore unrelated links. */ }
  };
  void linking.getInitialURL().then(capture);
  const subscription = linking.addEventListener('url', ({ url }) => capture(url));
  return { current: () => latest, dispose: () => subscription.remove() };
}
