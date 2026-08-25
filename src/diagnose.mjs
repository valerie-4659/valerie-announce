#!/usr/bin/env node
// Why request_token said 401.
//
// Code 32 - "Could not authenticate you" - is X's answer to several unrelated
// mistakes, and it names none of them. This asks the questions one at a time.

import { loadEnv } from "./env.mjs";
import { authHeader } from "./oauth1.mjs";

loadEnv();

const key = process.env.X_API_KEY || "";
const secret = process.env.X_API_SECRET || "";

console.log("Credentials, as loaded:");
console.log(`  X_API_KEY     ${key.length} characters${/\s/.test(key) ? "  !! contains whitespace" : ""}`);
console.log(`  X_API_SECRET  ${secret.length} characters${/\s/.test(secret) ? "  !! contains whitespace" : ""}`);
// An API Key is 25 characters and a Secret is 50. An OAuth 2.0 Client ID is
// longer and usually ends in a run of colons or base64 padding - pasting that
// pair here is the most common way to earn a code 32.
if (key.length !== 25) console.log("  !! An API Key is normally 25 characters. Is this the OAuth 2.0 Client ID?");
if (secret.length !== 50) console.log("  !! An API Key Secret is normally 50 characters.");
console.log("");

const HOSTS = ["https://api.twitter.com", "https://api.x.com"];

for (const host of HOSTS) {
  const url = `${host}/oauth/request_token`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: authHeader({
          method: "POST",
          url,
          extra: { oauth_callback: "oob" },
          consumerKey: key,
          consumerSecret: secret,
        }),
      },
      redirect: "manual",
    });
    const body = (await response.text()).slice(0, 200);
    const verdict = response.ok ? "OK" : `${response.status}`;
    console.log(`${host.padEnd(24)} ${verdict}  ${response.ok ? "token received" : body}`);
  } catch (error) {
    console.log(`${host.padEnd(24)} threw: ${error.message}`);
  }
}

console.log("");
console.log("If both answered 401 code 32, in order of likelihood:");
console.log("  1. The pair is not the API Key and Secret - the Keys and tokens tab");
console.log("     also offers an OAuth 2.0 Client ID and Secret, which will not work here.");
console.log("  2. User authentication was never saved on the app: it needs a callback");
console.log("     URL and a website URL, and Read and write permissions.");
console.log("  3. The keys were regenerated in the portal after being copied.");
