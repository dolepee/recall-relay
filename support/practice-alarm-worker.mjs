// Test-only Worker around the real PracticeCase class, so a workerd test can
// hold one object instance across its alarm. It is not part of the deployment.
import {PracticeCase} from '../cloud/practice-case.mjs';
export {PracticeCase};
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!/^[a-f0-9]{64}$/.test(id || '')) return new Response('bad id', {status: 400});
    const input = {
      token: url.searchParams.get('token'),
      fresh: url.searchParams.get('fresh') === '1',
      path: '/api/practice/state',
      method: 'GET',
      origin: url.origin,
      contentType: '',
      body: {},
    };
    return Response.json(await env.PRACTICE.getByName(id).handle(input));
  },
};
