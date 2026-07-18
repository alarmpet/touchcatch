export function rotateAfterValidation(uuid: () => string = () => crypto.randomUUID()): string {
  const value = uuid();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) throw new Error('IDEMPOTENCY_KEY_INVALID');
  return value;
}
