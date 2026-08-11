export type AuthenticatedPrincipal = Readonly<{
  authenticatedUserId: string;
}>;

export interface BearerVerifier {
  verify(request: Request): Promise<AuthenticatedPrincipal>;
}

export class UnauthorizedError extends Error {
  readonly code = 'UNAUTHORIZED' as const;

  constructor(options?: ErrorOptions) {
    super('UNAUTHORIZED', options);
    this.name = 'UnauthorizedError';
  }
}

export function extractBearerToken(request: Request): string {
  const authorization = request.headers.get('authorization');
  const match = authorization?.match(/^Bearer ([^\s,]+)$/i);
  if (!match?.[1]) throw new UnauthorizedError();
  return match[1];
}
