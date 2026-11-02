import {ExpiredSessionError, PracticeSessionError, StaleActionError} from './practice-workspace.mjs';

const ACTIONS = new Set(['role', 'submit', 'request-changes', 'review', 'approve', 'resume', 'restart', 'new']);
const COOKIE = `rr_practice`;

// Practice routes are mounted separately from the connected sandbox workspace.
// They accept no claim identifier from the client: the browser session cookie
// alone selects the case, so two sessions cannot address each other's work.
// Every mutation also carries the attempt, case and revision it displayed.
export function practiceRoutes(practice, {json, body, origin, freshToken}) {
  return async (req, res, path) => {
    if (!path.startsWith('/api/practice/')) return false;
    res.setHeader('Referrer-Policy', 'no-referrer');
    const action = path.slice('/api/practice/'.length);
    try {
      if (!['GET', 'POST'].includes(req.method)) {
        json(res, 405, {error: 'Unsupported method.'});
        return true;
      }
      if (req.method === 'POST' && (req.headers.origin !== origin || req.headers['content-type'] !== 'application/json')) {
        json(res, 403, {error: 'Same-origin JSON requests required.'});
        return true;
      }
      // Validate the route before any state exists.
      if (req.method === 'GET' ? action !== 'state' : !ACTIONS.has(action)) {
        json(res, 404, {error: 'Unknown action.'});
        return true;
      }
      // Read (and bound) the body before opening or creating a practice session.
      const input = req.method === 'POST' ? await body(req) : {};
      const cookie = new RegExp(`(?:^|;\\s*)${COOKIE}=([\\w-]{43})(?:;|$)`).exec(req.headers.cookie || '')?.[1] || null;
      const clear = () => res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/api/practice; Max-Age=0${origin.startsWith('https:') ? '; Secure' : ''}`);
      let opened;
      try {
        opened = freshToken ? practice.new(freshToken) : action === 'new' ? practice.new(cookie) : practice.open(cookie);
      } catch (error) {
        if (error instanceof ExpiredSessionError || (cookie && error instanceof PracticeSessionError)) {
          clear();
          json(res, 410, {error: error.message, expired: true});
          return true;
        }
        throw error;
      }
      if (opened.fresh) {
        res.setHeader('Set-Cookie', `${COOKIE}=${opened.token}; HttpOnly; SameSite=Strict; Path=/api/practice; Max-Age=86400${origin.startsWith('https:') ? '; Secure' : ''}`);
      }
      const session = opened.session;
      if (req.method === 'GET') {
        json(res, 200, practice.view(session));
        return true;
      }
      const actions = {
        role: () => practice.role(session, input.role),
        submit: () => practice.submit(session, input),
        'request-changes': () => practice.requestChanges(session, input),
        review: () => practice.review(session, input),
        approve: () => practice.approve(session, input),
        resume: () => practice.resume(session, input),
        restart: () => practice.restart(session),
        new: () => practice.view(session),
      };
      const result = await actions[action]();
      json(res, 200, result?.mode === 'practice' ? result : practice.view(session));
      return true;
    } catch (error) {
      if (error instanceof StaleActionError) {
        json(res, 409, {error: error.message, stale: true});
        return true;
      }
      if (error instanceof ExpiredSessionError) {
        res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/api/practice; Max-Age=0${origin.startsWith('https:') ? '; Secure' : ''}`);
        json(res, 410, {error: error.message, expired: true});
        return true;
      }
      json(res, 400, {error: error.message});
      return true;
    }
  };
}
