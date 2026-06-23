import { randomBytes, createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const AUTHORIZE_URL = 'https://api.whop.com/oauth/authorize';
const REDIRECT_URI = 'https://orbalpha.com/api/auth/callback';
const ERROR_PATH = '/login-error/';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function base64url(input: Buffer): string {
  return input.toString('base64url');
}

// Vercel Node serverless function — default-export (req, res) handler, the
// signature THIS project's runtime invokes (proven by api/ping.ts). The prior
// `export function GET(): Promise<Response>` Web/Route-Handler form was never
// called by the Node runtime → empty 200 / no redirect. Only the I/O boundary
// changed below; the PKCE + state + Whop-authorize-redirect logic is unchanged.
export default async function handler(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const codeVerifier = base64url(randomBytes(32));
    const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());
    const state = base64url(randomBytes(32));
    // Whop's OIDC rejects `scope=openid` without a nonce ("nonce is required for
    // openid scope"). This flow authenticates via access_token + userinfo (no ID
    // token is parsed), so the nonce only needs to be present, not round-trip-validated.
    const nonce = base64url(randomBytes(32));

    const tx = base64url(Buffer.from(JSON.stringify({ v: codeVerifier, s: state })));

    const authorizeUrl = new URL(AUTHORIZE_URL);
    authorizeUrl.searchParams.set('client_id', requireEnv('WHOP_CLIENT_ID'));
    authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('scope', 'openid');
    authorizeUrl.searchParams.set('nonce', nonce);
    authorizeUrl.searchParams.set('state', state);
    authorizeUrl.searchParams.set('code_challenge', codeChallenge);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');

    res.setHeader(
      'Set-Cookie',
      `oauth_tx=${tx}; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=600`,
    );
    res.setHeader('Location', authorizeUrl.toString());
    res.statusCode = 302;
    res.end();
  } catch (error) {
    console.error('oauth login failed; denying', error);
    res.setHeader('Location', ERROR_PATH);
    res.statusCode = 302;
    res.end();
  }
}
