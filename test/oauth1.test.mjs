// The worked example from X's own documentation, kept as a fixed point.
//
// A wrong signature comes back from X as "401 Unauthorized" and nothing else —
// no indication whether the fault was the encoding, the sort, the base string
// or the key. This test is the only place where that question has an answer.
//
// Source: https://docs.x.com/fundamentals/authentication/oauth-1-0a/creating-a-signature

import test from "node:test";
import assert from "node:assert/strict";
import { percentEncode, signatureBaseString, signingKey, sign, authHeader } from "../src/oauth1.mjs";

const EXAMPLE = {
  consumerKey: "xvz1evFS4wEEPTGEFPHBog",
  consumerSecret: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
  token: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb",
  tokenSecret: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE",
  nonce: "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg",
  timestamp: 1318622958,
  method: "POST",
  url: "https://api.x.com/1.1/statuses/update.json",
  params: {
    status: "Hello Ladies + Gentlemen, a signed OAuth request!",
    include_entities: "true",
  },
};

const oauthParams = {
  oauth_consumer_key: EXAMPLE.consumerKey,
  oauth_nonce: EXAMPLE.nonce,
  oauth_signature_method: "HMAC-SHA1",
  oauth_timestamp: String(EXAMPLE.timestamp),
  oauth_token: EXAMPLE.token,
  oauth_version: "1.0",
};

test("percent encoding follows RFC 3986, not encodeURIComponent", () => {
  // The five characters where the two disagree. Everything else is identical,
  // which is what makes this the easy thing to get wrong and never notice.
  assert.equal(percentEncode("!"), "%21");
  assert.equal(percentEncode("'"), "%27");
  assert.equal(percentEncode("("), "%28");
  assert.equal(percentEncode(")"), "%29");
  assert.equal(percentEncode("*"), "%2A");
  // And the ones that must stay untouched.
  assert.equal(percentEncode("-._~"), "-._~");
  assert.equal(percentEncode("Ladies + Gentlemen"), "Ladies%20%2B%20Gentlemen");
});

test("the signature base string matches X's worked example", () => {
  const base = signatureBaseString({
    method: EXAMPLE.method,
    url: EXAMPLE.url,
    params: { ...EXAMPLE.params, ...oauthParams },
  });

  assert.equal(
    base,
    "POST&https%3A%2F%2Fapi.x.com%2F1.1%2Fstatuses%2Fupdate.json&" +
      "include_entities%3Dtrue%26oauth_consumer_key%3Dxvz1evFS4wEEPTGEFPHBog%26" +
      "oauth_nonce%3DkYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg%26" +
      "oauth_signature_method%3DHMAC-SHA1%26oauth_timestamp%3D1318622958%26" +
      "oauth_token%3D370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb%26" +
      "oauth_version%3D1.0%26" +
      "status%3DHello%2520Ladies%2520%252B%2520Gentlemen%252C%2520a%2520signed%2520OAuth%2520request%2521",
  );
});

test("the signing key is the two secrets, encoded, joined by an ampersand", () => {
  assert.equal(
    signingKey({ consumerSecret: EXAMPLE.consumerSecret, tokenSecret: EXAMPLE.tokenSecret }),
    "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw&LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE",
  );
});

test("the signature matches X's worked example", () => {
  const signature = sign({
    method: EXAMPLE.method,
    url: EXAMPLE.url,
    params: { ...EXAMPLE.params, ...oauthParams },
    consumerSecret: EXAMPLE.consumerSecret,
    tokenSecret: EXAMPLE.tokenSecret,
  });

  assert.equal(signature, "Ls93hJiZbQ3akF3HF3x1Bz8/zU4=");
});

test("the header carries the signature, percent-encoded, and every oauth field", () => {
  const header = authHeader({
    method: EXAMPLE.method,
    url: EXAMPLE.url,
    query: EXAMPLE.params,
    consumerKey: EXAMPLE.consumerKey,
    consumerSecret: EXAMPLE.consumerSecret,
    token: EXAMPLE.token,
    tokenSecret: EXAMPLE.tokenSecret,
    nonce: EXAMPLE.nonce,
    timestamp: EXAMPLE.timestamp,
  });

  assert.match(header, /^OAuth /);
  // The slash and the equals sign in the signature have to survive as %2F and
  // %3D, or X reads a different signature than the one that was computed.
  assert.ok(header.includes('oauth_signature="Ls93hJiZbQ3akF3HF3x1Bz8%2FzU4%3D"'), header);
  assert.ok(header.includes(`oauth_token="${EXAMPLE.token}"`));
  // The request's own parameters stay in the URL and out of the header.
  assert.ok(!header.includes("include_entities"), header);
});

test("a request with no token yet signs with the consumer secret alone", () => {
  // This is the shape the authorisation flow starts with, where getting the
  // trailing ampersand of the signing key wrong is the classic mistake.
  assert.equal(signingKey({ consumerSecret: "secret" }), "secret&");
  const header = authHeader({
    method: "POST",
    url: "https://api.x.com/oauth/request_token",
    extra: { oauth_callback: "oob" },
    consumerKey: "key",
    consumerSecret: "secret",
    nonce: "n",
    timestamp: 1,
  });
  assert.ok(header.includes('oauth_callback="oob"'), header);
  assert.ok(!header.includes("oauth_token="), header);
});
