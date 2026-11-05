import {createHash,timingSafeEqual} from 'node:crypto';
const pattern=/^[A-Za-z0-9_-]{43}$/;
export function evaluationAccess(code,expectedHash){
 if(!pattern.test(code||'')||! /^[a-f0-9]{64}$/.test(expectedHash||''))return false;
 const actual=createHash('sha256').update(code).digest('hex');return timingSafeEqual(Buffer.from(actual),Buffer.from(expectedHash));
}
export function evaluationCookie(cookie,expectedHash){return evaluationAccess(/(?:^|;\s*)rr_evaluation=([A-Za-z0-9_-]{43})(?:;|$)/.exec(cookie||'')?.[1],expectedHash);}
export function evaluationCookieHeader(code,secure){return `rr_evaluation=${code}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=2592000${secure?'; Secure':''}`;}
