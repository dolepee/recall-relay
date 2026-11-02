import {createHash,randomBytes} from 'node:crypto';

// Routing for the hosted practice surface. Kept separate from the connected
// workspace router so neither cookie, path nor quota can stand in for the other.
export const PRACTICE_COOKIE = 'rr_practice';
export const PRACTICE_TTL_MS = 24 * 60 * 60 * 1000;
export const PRACTICE_MAX_BYTES = 2_850_000;
export const PRACTICE_ACTIONS = new Set(['state', 'role', 'submit', 'request-changes', 'review', 'approve', 'resume', 'restart', 'new']);
const TOKEN = /^[\w-]{43}$/;

export function practiceAction(path) {
  if (!path.startsWith('/api/practice/')) return null;
  const action = path.slice('/api/practice/'.length);
  return PRACTICE_ACTIONS.has(action) ? action : null;
}

export function validatePracticeRequest({method,pathname,requestOrigin,contentType,origin}) {
  if (!['GET', 'POST'].includes(method)) return {status: 405, error: 'Unsupported method.'};
  const action = practiceAction(pathname);
  if (!action) return {status: 404, error: 'Unknown action.'};
  if (method === 'POST' && (requestOrigin !== origin || contentType !== 'application/json'))
    return {status: 403, error: 'Same-origin JSON requests required.'};
  return null;
}

export function practiceCookie(header) {
  return new RegExp(`(?:^|;\\s*)${PRACTICE_COOKIE}=([\\w-]{43})(?:;|$)`).exec(header || '')?.[1] || null;
}

export function practiceObjectName(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function practiceSecret() {
  return randomBytes(32).toString('base64url');
}

// A missing cookie starts a session only for a first read; an unknown or
// malformed cookie asks the interface for an explicit fresh start.
export function resolvePracticeSession(action, cookie, makeSecret = practiceSecret) {
  if (action === 'new' || (!cookie && action === 'state')) {
    const token = makeSecret();
    return {token, fresh: true, id: practiceObjectName(token)};
  }
  if (!cookie || !TOKEN.test(cookie)) return {expired: true};
  return {token: cookie, fresh: false, id: practiceObjectName(cookie)};
}

export function practiceCookieHeader(token, origin, maxAge = Math.floor(PRACTICE_TTL_MS / 1000)) {
  return `${PRACTICE_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/api/practice; Max-Age=${maxAge}${origin.startsWith('https:') ? '; Secure' : ''}`;
}
