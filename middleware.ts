// middleware.ts — Pro-access gate for the optimizer preview.
// Vercel Routing Middleware (framework-agnostic). Web API only — no next/server.
import { verifyToken } from './lib/jwt.js';

// `matcher` scopes the middleware to ONLY the gated paths. Without it the middleware
// ran on EVERY request and broke static serving site-wide (homepage/all pages → empty
// 200). It runs only for the prefixes below; everything else serves normally.
// Every entry here must also appear in GATED_PREFIXES, and vice versa.
export const config = {
  runtime: 'nodejs',
  matcher: [
    '/tools/optimizer-preview',
    '/tools/optimizer-preview/:path*',
    '/tools/frb-optimizer-preview',
    '/tools/frb-optimizer-preview/:path*',
  ],
};

const GATED_PREFIXES = ['/tools/optimizer-preview', '/tools/frb-optimizer-preview'];
const LOGIN_PATH = '/api/auth/login';

// A JWS compact serialization: three base64url segments separated by dots.
const JWT_FORMAT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function redirectToLogin(): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: LOGIN_PATH },
  });
}

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) return part.slice(idx + 1).trim();
  }
  return undefined;
}

export default async function middleware(
  request: Request,
): Promise<Response | undefined> {
  const { pathname } = new URL(request.url);

  // (1)(5) Only gate the prefixes above; every other path passes through.
  if (!GATED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return;

  // (2) Read the session cookie.
  const token = readCookie(request.headers.get('cookie'), 'orbalpha_session');

  // (3) AT-5 short-circuit: format-only precheck before any crypto.
  //     Missing or malformed → redirect, never call verifyToken.
  if (!token || !JWT_FORMAT.test(token)) return redirectToLogin();

  // (4) Well-formed → verify. Success passes through; any throw redirects.
  try {
    await verifyToken(token);
  } catch {
    return redirectToLogin();
  }

  // (4) Valid session → allow through to the static optimizer files.
  return;
}
