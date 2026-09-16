/**
 * Generates the Ed25519 keypair that signs live-preview tokens.
 *
 * Run once, then:
 * - put the **private** key in `LIVE_PREVIEW_SIGNING_KEY` on the Railway
 *   service (and in `.env` for local work),
 * - commit the **public** key into each consumer that verifies tokens.
 *
 * The public key is not a secret. That is the whole point of signing rather
 * than sharing: the atlas ships as a public bundle, so any key it holds is
 * published, and a verification key being published costs nothing.
 *
 *   pnpm generate:preview-keypair
 *
 * ⚠ Rotating invalidates every outstanding token immediately. They live 45
 * minutes, so the blast radius is one editing session — but roll the consumers'
 * public key at the same time, or every panel shows the unavailable page until
 * they catch up.
 */

async function main(): Promise<void> {
  // `generateKey` is typed as `CryptoKeyPair | CryptoKey` for an algorithm the
  // lib cannot statically prove is asymmetric. Ed25519 always yields a pair.
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair

  // JWK, not PKCS8: a JWK carries the public `x` beside the private `d`, so one
  // variable gives SahajCloud both halves. It mints tokens AND verifies them
  // again when a consumer forwards one back, and two separate variables would
  // eventually drift apart in a way that looks exactly like a forged token.
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const privateKey = Buffer.from(JSON.stringify(jwk), 'utf8').toString('base64')

  const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString(
    'base64',
  )

  console.log('\nPRIVATE — SahajCloud only. Railway service variable, and your local .env:\n')
  console.log(`LIVE_PREVIEW_SIGNING_KEY=${privateKey}\n`)
  console.log('PUBLIC — commit into each consumer that verifies tokens:\n')
  console.log(`${publicKey}\n`)
  console.log('  WeMeditateWeb  → PUBLIC__LIVE_PREVIEW_VERIFY_KEY in .env.production')
  console.log('  SahajAtlasWeb  → VITE_LIVE_PREVIEW_VERIFY_KEY in .env\n')
}

void main()
