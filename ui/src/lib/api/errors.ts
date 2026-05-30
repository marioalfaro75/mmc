/**
 * Thrown by service API clients when they can prove the failure is an
 * auth problem (wrong / missing credential), as opposed to a network or
 * service-down failure. The /api/health route uses this distinction to
 * mark the chip as `auth_required` instead of `offline`.
 */
export class AuthRequiredError extends Error {
  readonly isAuthRequired = true;

  constructor(
    public readonly service: string,
    public readonly envVar: string,
    public readonly hint?: string,
  ) {
    super(`${service} requires authentication — set ${envVar}${hint ? ` (${hint})` : ''}`);
    this.name = 'AuthRequiredError';
  }
}

export function isAuthRequiredError(err: unknown): err is AuthRequiredError {
  return err instanceof Error && (err as AuthRequiredError).isAuthRequired === true;
}
