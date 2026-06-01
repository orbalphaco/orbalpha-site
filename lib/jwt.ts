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
  let jwks: (JWK & { kid?: string }) | null | undefined;
  try {
    jwks = await get<JWK & { kid?: string }>('jwks');
  } catch {
    throw new Error('Edge Config unavailable');
  }
  if (!jwks) throw new Error('Edge Config unavailable');

  const publicKey = await importJWK(jwks, 'EdDSA');

  const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
    algorithms: ['EdDSA'],
    issuer: 'orbalpha',
    audience: 'orbalpha',
  });

  if (protectedHeader.kid !== jwks.kid) throw new Error('kid mismatch');

  const jti = payload.jti;
  if (!jti) throw new Error('missing jti');
  if (await redis.get(`denylist:${jti}`)) throw new Error('token revoked');

  const sub = payload.sub;
  if (!sub) throw new Error('missing sub');

  return { sub, jti };
}
