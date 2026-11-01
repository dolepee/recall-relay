import {PracticeSessionError} from './practice-workspace.mjs';

// Practice routes are mounted separately from the connected sandbox workspace.
// They accept no claim identifier from the client: the browser session cookie
// alone selects the case, so two sessions cannot address each other's work.
export function practiceRoutes(practice, {json, body, origin}) {
  return async (req, res, path) => {
    if (!path.startsWith('/api/practice/')) return false;
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      if (!['GET', 'POST'].includes(req.method)) {
        json(res, 405, {error: 'Unsupported method.'});
        return true;
      }
      if (req.method === 'POST' && (req.headers.origin !== origin || req.headers['content-type'] !== 'application/json')) {
        json(res, 403, {error: 'Same-origin JSON requests required.'});
        return true;
      }
      const cookie = /(?:^|;\s*)rr_practice=([\w-]{43})(?:;|$)/.exec(req.headers.cookie || '')?.[1] || null;
      let opened;
      try {
        opened = practice.open(cookie);
      } catch (error) {
        if (!(error instanceof PracticeSessionError)) throw error;
        json(res, 401, {error: 'This practice case is not open in this browser session. Reload /practice to start one.'});
        return true;
      }
      if (opened.fresh) {
        res.setHeader('Set-Cookie', `rr_practice=${opened.token}; HttpOnly; SameSite=Strict; Path=/api/practice; Max-Age=604800${origin.startsWith('https:') ? '; Secure' : ''}`);
      }
      const session = opened.session;
      if (path === '/api/practice/state' && req.method === 'GET') {
        json(res, 200, practice.view(session));
        return true;
      }
      if (req.method !== 'POST') {
        json(res, 405, {error: 'Use the action button to continue.'});
        return true;
      }
      const input = await body(req);
      const actions = {
        '/api/practice/role': () => practice.role(session, input.role),
        '/api/practice/submit': () => practice.submit(session, input),
        '/api/practice/request-changes': () => practice.requestChanges(session, input),
        '/api/practice/review': () => practice.review(session, input),
        '/api/practice/approve': () => practice.approve(session, input),
        '/api/practice/restart': () => practice.restart(session),
      };
      if (!actions[path]) {
        json(res, 404, {error: 'Unknown action.'});
        return true;
      }
      const result = await actions[path]();
      json(res, 200, result?.mode === 'practice' ? result : practice.view(session));
      return true;
    } catch (error) {
      json(res, 400, {error: error.message});
      return true;
    }
  };
}
