import { generateKeyPair, exportPKCS8, exportJWK } from 'jose';
import { randomUUID } from 'node:crypto';

const { publicKey, privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });

const pkcs8Pem = await exportPKCS8(privateKey);
const publicJWK = await exportJWK(publicKey);

const kid = randomUUID();
const jwk = { ...publicJWK, kid };

if (!jwk.kid) {
  throw new Error('kid missing from JWK — refusing to emit an unidentified key');
}

const privateSingleLine = pkcs8Pem.trimEnd().replace(/\n/g, '\\n');

console.error('⚠  PRIVATE KEY BELOW — paste directly into Vercel env vars. Do not log, pipe, store, or share this output.');
console.log('----------------------------------------');
console.log(`JWT_SIGNING_KEY_KID=${kid}`);
console.log(`JWT_SIGNING_KEY_PRIVATE=${privateSingleLine}`);
console.log('JWKS entry — seed into Edge Config:');
console.log(JSON.stringify(jwk, null, 2));
console.log('----------------------------------------');
