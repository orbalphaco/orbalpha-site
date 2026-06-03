// THROWAWAY PROBE — delete after confirming Vercel function handler signature.
export default async function handler(request: Request): Promise<Response> {
  void request;
  return new Response('pong');
}
