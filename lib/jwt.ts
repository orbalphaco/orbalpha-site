import { SignJWT, jwtVerify, importPKCS8, importJWK, type JWK } from 'jose';
import { get } from '@vercel/edge-config';
import { Redis } from '@upstash/redis';
import { randomUUID } from 'node:crypto';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const redis = new Redis({
  url: requireEnv('KV_URL'),
  token: requireEnv('KV_REST_API_TOKEN'),
});

export async function issueToken(payload: { sub: string }): Promise<string> {
  const privateKey = await importPKCS8(
    requireEnv('JWT_SIGNING_KEY_PRIVATE').replace(/\\n/g, '\n'),
    'EdDSA',
  );
  const kid = requireEnv('JWT_SIGNING_KEY_KID');
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
  const tokenHeader = JSON.parse(
    Buffer.from(token.split('.')[0], 'base64url').toString('utf8'),
  );
  const tokenKid = tokenHeader.kid as string | undefined;
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
  if (await redis.get(`denylist:${jti}`)) throw new Error('token revoked');

  const sub = payload.sub;
  if (typeof sub !== 'string' || sub.length === 0) throw new Error('missing sub');

  return { sub, jti };
}
