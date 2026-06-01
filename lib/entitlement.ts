import Whop from '@whop/sdk';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export async function checkEntitlement(whopUserId: string): Promise<boolean> {
  try {
    const client = new Whop({ apiKey: requireEnv('WHOP_API_KEY') });
    const companyId = requireEnv('WHOP_COMPANY_ID');
    const productId = requireEnv('WHOP_PRO_PRODUCT_ID');

    for await (const membership of client.memberships.list({
      company_id: companyId,
      product_ids: [productId],
      user_ids: [whopUserId],
    })) {
      if (membership.product.id !== productId) continue;
      if (membership.status === 'active') return true;
    }

    return false;
  } catch (error) {
    console.error('checkEntitlement failed; denying access', error);
    return false;
  }
}
