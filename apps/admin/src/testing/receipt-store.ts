import 'server-only';

export type ReceiptClaim = Readonly<{ key: string; requestHash: string; attestationHash: string; ownerId: string; now: number; leaseMs: number }>;
type Connection = Readonly<{ query(sql: string, values: readonly unknown[]): Promise<{ rows: readonly Record<string, unknown>[] }> }>;

export class PostgresPublishReceiptStore {
  constructor(private readonly connection: Connection) {}
  async claim(input: ReceiptClaim) {
    const result = await this.connection.query(
      `with locked as (select request_hash, attestation_hash, result, fence, lease_expires_at from private.admin_publish_receipts where idempotency_key=$1 for update),
       claimed as (insert into private.admin_publish_receipts(idempotency_key,request_hash,attestation_hash,owner_id,fence,lease_expires_at,state)
       values($1,$2,$3,$4,1,to_timestamp(($5+$6)/1000.0),'PENDING') on conflict(idempotency_key) do update set owner_id=$4,fence=private.admin_publish_receipts.fence+1,lease_expires_at=to_timestamp(($5+$6)/1000.0)
       where private.admin_publish_receipts.state='PENDING' and private.admin_publish_receipts.lease_expires_at<=to_timestamp($5/1000.0)
       returning fence) select 'OWNER' as disposition,fence from claimed union all select 'REPLAY',fence from locked where result is not null`,
      [input.key, input.requestHash, input.attestationHash, input.ownerId, input.now, input.leaseMs],
    );
    return result.rows[0] ?? { disposition: 'PENDING' };
  }
  async complete(key: string, requestHash: string, ownerId: string, fence: number, result: unknown) {
    const response = await this.connection.query('update private.admin_publish_receipts set state=\'COMPLETED\',result=$5 where idempotency_key=$1 and request_hash=$2 and owner_id=$3 and fence=$4 and state=\'PENDING\' returning result', [key, requestHash, ownerId, fence, result]);
    if (response.rows.length !== 1) throw new Error('PUBLISH_FENCE_LOST');
  }
  async fail(key: string, ownerId: string, fence: number) {
    await this.connection.query('delete from private.admin_publish_receipts where idempotency_key=$1 and owner_id=$2 and fence=$3 and state=\'PENDING\'', [key, ownerId, fence]);
  }
}
