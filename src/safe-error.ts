// An error that came from an HTTP call carries the request: its headers (Authorization: Bearer <key>)
// and its body. Printing the whole object writes the customer's key to stderr and from there to
// whatever collects the MCP client's logs, so log only what is needed to diagnose it.

const KEY = /\btvly-[A-Za-z0-9_-]{16,}/g;
const BEARER = /\b(bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi;

function maskKeys(text: string): string {
    return text.replace(KEY, (m) => '****' + m.slice(-4)).replace(BEARER, '$1[REDACTED]');
}

/** One line: the error's name and message, plus the HTTP status or code when it has one. */
export function describeError(error: unknown): string {
    if (error === null || error === undefined) return 'unknown error';
    if (typeof error !== 'object') return maskKeys(String(error));
    const e = error as { name?: unknown; message?: unknown; code?: unknown; response?: { status?: unknown } };
    const parts = [`${typeof e.name === 'string' ? e.name : 'Error'}: ${typeof e.message === 'string' ? e.message : 'no message'}`];
    if (typeof e.response?.status === 'number') parts.push(`status ${e.response.status}`);
    if (typeof e.code === 'string' || typeof e.code === 'number') parts.push(`code ${e.code}`);
    return maskKeys(parts.length > 1 ? `${parts[0]} (${parts.slice(1).join(', ')})` : parts[0]);
}
