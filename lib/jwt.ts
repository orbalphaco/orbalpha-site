import { SignJWT, jwtVerify, importPKCS8, importJWK, decodeProtectedHeader, type JWK } from 'jose';
import { get } from '@vercel/edge-config';
import { Redis } from '@upstash/redis';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

let _redis: Redis | null = null;
function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: requireEnv('KV_REST_API_URL'),
      token: requireEnv('KV_REST_API_TOKEN'),
    });
  }
  return _redis;
}

export async function issueToken(payload: { sub: string }): Promise<string> {
  const privateKey = await importPKCS8(
    requireEnv('JWT_SIGNING_KEY_PRIVATE').replace(/\\n/g, '\n'),
    'EdDSA',
  );
  const kid = requireEnv('JWT_SIGNING_KEY_KID');
  // Node.js runtime only — issueToken runs in the OAuth callback function, never on Edge.
  const { randomUUID } = await import('node:crypto');
  const jti = randomUUID();

  return await new SignJWT({ ...payload, jti })
    .setProtectedHeader({ alg: 'EdDSA', kid })
    .setIssuer('orbalpha')
    .setAudience('orbalpha')
    .setExpirationTime('60m')
    .sign(privateKey);
}

export async function verifyToken(token: string): Promise<{ sub: string; jti: string }> {
  // Read JWKS array from Edge Config. Fail closed on any error.
  let jwksData: { keys: (JWK & { kid?: string })[] } | null | undefined;
  try {
    jwksData = await get<{ keys: (JWK & { kid?: string })[] }>('jwks');
  } catch {
    throw new Error('Edge Config unavailable');
  }
  if (!jwksData?.keys?.length) throw new Error('Edge Config unavailable');

  // Peek at the token header to find which kid to use for verification.
  // This selects the key BEFORE cryptographic verification (AT-2 fix).
  const tokenHeader = decodeProtectedHeader(token);
  const tokenKid: string | undefined = tokenHeader.kid;
  if (!tokenKid) throw new Error('missing kid in token header');

  const jwk = jwksData.keys.find(k => k.kid === tokenKid);
  if (!jwk) throw new Error('kid not found in JWKS');

  const publicKey = await importJWK(jwk, 'EdDSA');

  const { payload } = await jwtVerify(token, publicKey, {
    algorithms: ['EdDSA'],
    issuer: 'orbalpha',
    audience: 'orbalpha',
  });

  const jti = payload.jti;
  if (!jti) throw new Error('missing jti');

  // Denylist is revocation-only (explicit logout/invalidation at Stage 5).
  // Not single-use enforcement. Narrow TOCTOU window is accepted for this
  // use case — two concurrent logout requests for the same token is not
  // a realistic attack scenario.
  if (await getRedis().get(`denylist:${jti}`)) throw new Error('token revoked');

  const sub = payload.sub;
  if (typeof sub !== 'string' || sub.length === 0) throw new Error('missing sub');

  return { sub, jti };
}
