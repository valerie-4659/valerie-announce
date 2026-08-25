// OAuth 1.0a request signing.
//
// Why 1.0a and not the OAuth 2.0 flow the Crosspost Helper app itself uses:
// X's OAuth 2.0 refresh tokens rotate on every use, so an unattended job has
// to write the new one back into its own repository secret after every run,
// and a crash between the refresh and that write leaves the bot dead with no
// way to notice. OAuth 1.0a access tokens do not expire. For something that
// runs on a schedule and nobody watches, that difference outweighs everything
// else.
//
// The signature is the part that fails invisibly: X answers a wrong one with a
// bare 401 and no hint about which of the six steps was wrong. That is why the
// worked example from X's own documentation is a test in this repo.

import crypto from "node:crypto";

/**
 * RFC 3986, not `encodeURIComponent`. The four characters below are the whole
 * difference, and getting them wrong breaks exactly the requests that contain
 * punctuation — which is every post.
 */
export function percentEncode(value) {
  return encodeURIComponent(String(value ?? "")).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * The string that actually gets signed.
 *
 * Only query parameters and the oauth_* parameters belong in it. A JSON or
 * multipart body does not, which is why posting and uploading media can share
 * this function.
 */
export function signatureBaseString({ method, url, params }) {
  const encoded = Object.entries(params)
    .map(([key, value]) => [percentEncode(key), percentEncode(value)])
    .sort(([a, aValue], [b, bValue]) => (a === b ? (aValue < bValue ? -1 : 1) : a < b ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return [
    String(method).toUpperCase(),
    percentEncode(url),
    percentEncode(encoded),
  ].join("&");
}

export function signingKey({ consumerSecret, tokenSecret = "" }) {
  return `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
}

export function sign({ method, url, params, consumerSecret, tokenSecret }) {
  const base = signatureBaseString({ method, url, params });
  return crypto
    .createHmac("sha1", signingKey({ consumerSecret, tokenSecret }))
    .update(base)
    .digest("base64");
}

/**
 * The Authorization header for one request.
 *
 * @param {object} request
 * @param {string} request.method
 * @param {string} request.url            without a query string
 * @param {object} [request.query]        query parameters, which are signed
 * @param {object} [request.extra]        extra oauth_* parameters (callback, verifier)
 * @param {string} request.consumerKey
 * @param {string} request.consumerSecret
 * @param {string} [request.token]
 * @param {string} [request.tokenSecret]
 * @param {string} [request.nonce]        supplied only by the tests
 * @param {number} [request.timestamp]    supplied only by the tests
 */
export function authHeader({
  method,
  url,
  query = {},
  extra = {},
  consumerKey,
  consumerSecret,
  token,
  tokenSecret = "",
  nonce = crypto.randomBytes(24).toString("hex"),
  timestamp = Math.floor(Date.now() / 1000),
}) {
  const oauth = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(timestamp),
    oauth_version: "1.0",
    ...(token ? { oauth_token: token } : {}),
    ...extra,
  };

  const signature = sign({
    method,
    url,
    params: { ...query, ...oauth },
    consumerSecret,
    tokenSecret,
  });

  // Only the oauth_* parameters go in the header; the query stays in the URL.
  const header = Object.entries({ ...oauth, oauth_signature: signature })
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`)
    .join(", ");

  return `OAuth ${header}`;
}
