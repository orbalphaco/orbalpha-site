import { randomBytes, createHash } from 'node:crypto';

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

export async function GET(): Promise<Response> {
  try {
    const codeVerifier = base64url(randomBytes(32));
    const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());
    const state = base64url(randomBytes(32));

    const tx = base64url(Buffer.from(JSON.stringify({ v: codeVerifier, s: state })));

    const authorizeUrl = new URL(AUTHORIZE_URL);
    authorizeUrl.searchParams.set('client_id', requireEnv('WHOP_CLIENT_ID'));
    authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('scope', 'openid');
    authorizeUrl.searchParams.set('state', state);
    authorizeUrl.searchParams.set('code_challenge', codeChallenge);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');

    const headers = new Headers();
    headers.append('Location', authorizeUrl.toString());
    headers.append(
      'Set-Cookie',
      `oauth_tx=${tx}; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=600`,
    );
    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error('oauth login failed; denying', error);
    const headers = new Headers();
    headers.append('Location', ERROR_PATH);
    return new Response(null, { status: 302, headers });
  }
}
