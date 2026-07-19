import 'server-only';

export type DurablePublishReceipt = Readonly<{ state: 'PENDING' | 'COMPLETED'; requestHash: string; result: Readonly<{ contentRevisionId: string }> | null }>;
export type TransportResolution = Readonly<{ kind: 'SUCCESS'; contentRevisionId: string }> | Readonly<{ kind: 'ZERO_EFFECT' }> | Readonly<{ kind: 'OUTCOME_UNKNOWN'; retry: 'SAME_KEY' }>;

export function isProvenDatabaseRejection(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  return typeof code === 'string' && /^[0-9A-Z]{5}$/u.test(code) && !code.startsWith('08') && !['57P01', '57P02', '57P03'].includes(code);
}

export async function resolvePublishAfterTransportFailure(readReceipt: () => Promise<DurablePublishReceipt | null>, requestHash: string): Promise<TransportResolution> {
  let receipt: DurablePublishReceipt | null;
  try { receipt = await readReceipt(); } catch { return { kind: 'OUTCOME_UNKNOWN', retry: 'SAME_KEY' }; }
  if (!receipt) return { kind: 'ZERO_EFFECT' };
  if (receipt.requestHash !== requestHash) return { kind: 'OUTCOME_UNKNOWN', retry: 'SAME_KEY' };
  if (receipt.state === 'COMPLETED' && receipt.result?.contentRevisionId) return { kind: 'SUCCESS', contentRevisionId: receipt.result.contentRevisionId };
  return { kind: 'OUTCOME_UNKNOWN', retry: 'SAME_KEY' };
}
