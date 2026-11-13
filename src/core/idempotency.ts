/** Fresh UUID for an `idempotencyKey` turn option. Reuse it only to replay the same send or poll. */
export function createIdempotencyKey(): string {
  return globalThis.crypto.randomUUID()
}
