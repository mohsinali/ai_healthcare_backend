export class InvalidWebOriginError extends Error {
  constructor() {
    super('Invalid web origin.');
    this.name = 'InvalidWebOriginError';
  }
}

/** Canonicalizes one exact HTTP(S) origin, or throws a safe policy error. */
export function normalizeWebOrigin(value: string): string {
  if (typeof value !== 'string') throw new InvalidWebOriginError();
  const candidate = value.trim();
  if (
    !candidate ||
    candidate === 'null' ||
    candidate.includes('*') ||
    !/^https?:\/\//i.test(candidate)
  ) {
    throw new InvalidWebOriginError();
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new InvalidWebOriginError();
  }

  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new InvalidWebOriginError();
  }

  // Reject an explicitly empty port, which URL otherwise treats as omitted.
  const authority = candidate
    .slice(candidate.indexOf('//') + 2)
    .split(/[/?#]/)[0];
  if (authority.endsWith(':')) throw new InvalidWebOriginError();

  return parsed.origin;
}

export function normalizeWebOrigins(values: readonly string[]): string[] {
  return [...new Set(values.map(normalizeWebOrigin))].sort();
}

export function isWebOriginAllowed(
  requestOrigin: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  if (!requestOrigin) return false;
  try {
    const request = normalizeWebOrigin(requestOrigin);
    const allowed = new Set(allowedOrigins.map(normalizeWebOrigin));
    return allowed.has(request);
  } catch {
    return false;
  }
}
