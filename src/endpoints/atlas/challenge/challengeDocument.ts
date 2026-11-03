/**
 * The challenge page's HTML, and the script it runs in the browser.
 *
 * ⚠ **Cross-repo contract** with sydevs/SahajAtlasWeb's `src/lib/turnstile-frame.ts`, which frames
 * this page and parses every message it sends. Change the channel, a message `type`, a `reason`
 * or a query parameter in both repos in the same release: a drifted protocol fails silently, with
 * the widget waiting out its handshake timeout and nothing on the console.
 */

/** Namespaces every message both ways: the host page's window may carry its own cross-frame traffic. */
export const CHALLENGE_CHANNEL = 'sahaj-atlas-turnstile'

export const TURNSTILE_SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/**
 * Why the page renders no challenge. `origin`: the parent is not allowed, or named none — the one
 * refusal a host's developer acts on, by asking for their domain to be added. `unavailable`: this
 * deployment has no site key.
 */
export type ChallengeRefusal = 'origin' | 'unavailable'

export type ChallengeConfig =
  | {
      parent: string
      siteKey: string
      theme: 'light' | 'dark' | 'auto'
      language: string
      probe: boolean
    }
  | { refusal: ChallengeRefusal }

/**
 * Runs in the challenge frame, called with the JSON config the server baked in.
 *
 * ⚠ **Every message goes to `config.parent` and nowhere else, and that is the whole security
 * property.** The browser delivers a `postMessage` only when the receiving window's origin equals
 * the target, so a page framing this one from an origin the server did not allow receives
 * nothing, whatever `?parent=` it claims. The refusal alone goes to `'*'`: it carries no token,
 * and the widget needs it to fail at once rather than at its handshake timeout.
 *
 * `reset` is accepted from the parent window at that origin only, so nobody else can discard a
 * challenge the visitor has just solved.
 */
export const CHALLENGE_SCRIPT = `(function (config) {
  var parentWindow = window.parent;
  function send(message, targetOrigin) {
    message.channel = ${JSON.stringify(CHALLENGE_CHANNEL)};
    parentWindow.postMessage(message, targetOrigin || config.parent);
  }
  if (config.refusal) {
    send({ type: 'error', reason: config.refusal }, '*');
    return;
  }
  var script = document.createElement('script');
  script.src = ${JSON.stringify(TURNSTILE_SCRIPT_URL)};
  script.async = true;
  script.onerror = function () { send({ type: 'error' }); };
  script.onload = function () {
    var turnstile = window.turnstile;
    // A script that loads without defining the API is a content blocker or a stub proxy.
    if (!turnstile) { send({ type: 'error' }); return; }
    send({ type: 'ready' });
    if (config.probe) return;
    var widgetId = turnstile.render(document.getElementById('challenge'), {
      sitekey: config.siteKey,
      theme: config.theme,
      language: config.language,
      callback: function (token) { send({ type: 'token', token: token }); },
      'error-callback': function () { send({ type: 'error' }); },
      'expired-callback': function () { send({ type: 'expired' }); }
    });
    if (!widgetId) { send({ type: 'error' }); return; }
    window.addEventListener('message', function (event) {
      if (event.source !== parentWindow || event.origin !== config.parent) return;
      var data = event.data;
      if (data && data.channel === ${JSON.stringify(CHALLENGE_CHANNEL)} && data.type === 'reset') {
        turnstile.reset(widgetId);
      }
    });
  };
  document.head.appendChild(script);
})`

/** JSON safe inside a `<script>` element: `<` cannot close it. Every value is validated upstream already. */
const scriptJson = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c')

/**
 * The whole document. Transparent and margin-free, because the widget sizes its frame to
 * Turnstile's own 300×65 and nothing else is on the page.
 */
export function challengeDocument(config: ChallengeConfig): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<title>Security check</title>
<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}</style>
</head>
<body>
<div id="challenge"></div>
<script>${CHALLENGE_SCRIPT}(${scriptJson(config)});</script>
</body>
</html>
`
}
