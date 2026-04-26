/**
 * Heuristics to detect "the backend is unreachable from this machine" errors.
 * Used to surface a "looks like the VPN is off" hint to the user instead of a
 * generic 500.
 */

type MaybeNodeError = { code?: string; cause?: unknown };

const NETWORK_CODES = new Set([
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EAI_AGAIN',
]);

/**
 * Recursive scan: many libraries wrap the original Node error in `cause`.
 */
function findCode(err: unknown, depth = 0): string | undefined {
  if (depth > 4 || !err || typeof err !== 'object') return undefined;
  const e = err as MaybeNodeError;
  if (typeof e.code === 'string') return e.code;
  if (e.cause) return findCode(e.cause, depth + 1);
  return undefined;
}

export function isBackendUnreachable(err: unknown): boolean {
  const code = findCode(err);
  if (code && NETWORK_CODES.has(code)) return true;

  // Prisma's "Can't reach database server" — string match because the error
  // object surfacing varies between adapter and engine.
  const message = err instanceof Error ? err.message : '';
  if (/can'?t reach database server/i.test(message)) return true;
  if (/connection.*timed out/i.test(message)) return true;
  if (/getaddrinfo/i.test(message)) return true;

  return false;
}

/** Standard JSON body for routes that detect this. UI sniffs `code`. */
export function backendUnreachablePayload(detail?: string) {
  return {
    error: 'Backend unreachable',
    code: 'BACKEND_UNREACHABLE',
    detail:
      detail ??
      'Could not reach the cluster or database. If you are running locally, check that the VPN is connected.',
  };
}
