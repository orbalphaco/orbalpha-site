import { timingSafeEqual, createHmac } from 'node:crypto';
import { issueToken } from '../../lib/jwt.js';
import { checkEntitlement } from '../../lib/entitlement.js';

const TOKEN_URL = 'https://api.whop.com/oauth/token';
const USERINFO_URL = 'https://api.whop.com/oauth/userinfo';
const REDIRECT_URI = 'https://orbalpha.com/api/auth/callback';

const OPTIMIZER_PATH = '/tools/optimizer-preview/';
const NOT_SUBSCRIBED_PATH = '/not-subscribed/';
const ERROR_PATH = '/login-error/';

const CLEAR_OAUTH_TX =
  '__Host-oauth_tx=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function redirect(path: string, setCookies: string[] = []): Response {
  const headers = new Headers();
  headers.append('Location', path);
  for (const cookie of setCookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
}

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key) out[key] = part.slice(idx + 1).trim();
  }
  return out;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);

    if (url.searchParams.get('error')) return redirect(ERROR_PATH, [CLEAR_OAUTH_TX]);

    const code = url.searchParams.get('code');
    const stateParam = url.searchParams.get('state');
    if (!code || !stateParam) return redirect(ERROR_PATH, [CLEAR_OAUTH_TX]);

    const tx = parseCookies(request.headers.get('cookie'))['__Host-oauth_tx'];
    if (!tx) return redirect(ERROR_PATH);

    // --- HMAC verify FIRST, before decoding/parsing untrusted bytes ---
    const lastDot = tx.lastIndexOf('.');
    // reject missing separator, empty payload (leading dot), empty sig (trailing dot)
    if (lastDot <= 0 || lastDot === tx.length - 1) {
      return redirect(ERROR_PATH, [CLEAR_OAUTH_TX]);
    }
    const payloadPart = tx.slice(0, lastDot);
    const sigPart = tx.slice(lastDot + 1);
    const expectedSig = createHmac('sha256', requireEnv('OAUTH_TX_SIGNING_KEY'))
      .update(payloadPart)
      .digest()
      .toString('base64url');
    if (!safeEqual(sigPart, expectedSig)) return redirect(ERROR_PATH, [CLEAR_OAUTH_TX]);

    // --- signature valid → now safe to decode + parse ---
    let verifier: string;
    let stateCookie: string;
    try {
      const parsed = JSON.parse(
        Buffer.from(payloadPart, 'base64url').toString('utf8'),
      ) as { v?: string; s?: string; n?: string };
      verifier = parsed.v ?? '';
      stateCookie = parsed.s ?? '';
      // WARNING: parsed.n is the OIDC nonce. It is NOT verified here because this
      // flow consumes NO id_token (identity comes from /userinfo). If you ever add
      // id_token consumption, you MUST verify the id_token nonce against parsed.n.
    } catch {
      return redirect(ERROR_PATH, [CLEAR_OAUTH_TX]);
    }
    if (!verifier || !stateCookie) return redirect(ERROR_PATH, [CLEAR_OAUTH_TX]);

    // T3a CSRF (defense-in-depth): query state must equal authenticated cookie state.
    if (!safeEqual(stateParam, stateCookie)) return redirect(ERROR_PATH, [CLEAR_OAUTH_TX]);

    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: requireEnv('WHOP_CLIENT_ID'),
        client_secret: requireEnv('WHOP_CLIENT_SECRET'),
        code_verifier: verifier,
      }),
    });
    if (!tokenRes.ok) return redirect(ERROR_PATH, [CLEAR_OAUTH_TX]);

    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    const accessToken = tokenJson.access_token;
    if (!accessToken) return redirect(ERROR_PATH, [CLEAR_OAUTH_TX]);

    const userRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userRes.ok) return redirect(ERROR_PATH, [CLEAR_OAUTH_TX]);

    const userJson = (await userRes.json()) as { sub?: string };
    const sub = userJson.sub;
    if (!sub) return redirect(ERROR_PATH, [CLEAR_OAUTH_TX]);

    if (!(await checkEntitlement(sub))) return redirect(NOT_SUBSCRIBED_PATH, [CLEAR_OAUTH_TX]);

    const sessionJwt = await issueToken({ sub });
    const sessionCookie = `orbalpha_session=${sessionJwt}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3540`;

    return redirect(OPTIMIZER_PATH, [sessionCookie, CLEAR_OAUTH_TX]);
  } catch (error) {
    console.error('oauth callback failed; denying', error);
    return redirect(ERROR_PATH, [CLEAR_OAUTH_TX]);
  }
}
