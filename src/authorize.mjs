#!/usr/bin/env node
// One-off: get OAuth 1.0a access tokens for @valeries_apps.
//
// Run this once, on your own machine, logged into X as @valeries_apps. It
// prints two values that never expire; they go into the repository secrets and
// nothing here is needed again.
//
// The account that owns the developer app and the account that posts do not
// have to be the same. That is the point of the three-legged flow, and it is
// why @valeries_apps needs no developer signup of its own — which matters,
// because since February 2026 a new signup lands on pay-per-use with no free
// allowance at all.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { loadEnv } from "./env.mjs";
import { authHeader } from "./oauth1.mjs";

loadEnv();

const REQUEST_TOKEN = "https://api.x.com/oauth/request_token";
const AUTHORIZE = "https://api.x.com/oauth/authorize";
const ACCESS_TOKEN = "https://api.x.com/oauth/access_token";

const consumerKey = process.env.X_API_KEY;
const consumerSecret = process.env.X_API_SECRET;

if (!consumerKey || !consumerSecret) {
  console.error("X_API_KEY and X_API_SECRET must be set — put them in .env first.");
  process.exit(1);
}

function parseForm(text) {
  return Object.fromEntries(new URLSearchParams(text));
}

async function step(url, { extra = {}, token, tokenSecret } = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: authHeader({
        method: "POST",
        url,
        extra,
        consumerKey,
        consumerSecret,
        token,
        tokenSecret,
      }),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${url} answered ${response.status}: ${text.slice(0, 300)}`);
  return parseForm(text);
}

// The request token has to survive between asking for it and redeeming the
// PIN. Keeping it in memory means the whole flow has to happen inside one
// interactive process, which is exactly what fails when there is no terminal
// on the other end - so it goes to a file and the two halves can be minutes
// and two commands apart.
const PENDING = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".auth-request.json");

const pinArgument = (() => {
  const index = process.argv.indexOf("--pin");
  return index === -1 ? null : String(process.argv[index + 1] || "").trim();
})();

const rl = readline.createInterface({ input: stdin, output: stdout });

try {
  let request;
  let pin = pinArgument;

  if (pin && fs.existsSync(PENDING)) {
    // Second half: the browser has already been visited.
    request = JSON.parse(fs.readFileSync(PENDING, "utf8"));
  } else {
    // "oob" asks X for the PIN flow: no callback URL to register, no local
    // server to run.
    request = await step(REQUEST_TOKEN, { extra: { oauth_callback: "oob" } });
    if (request.oauth_callback_confirmed !== "true") {
      throw new Error("X did not confirm the out-of-band callback. Is the app allowed to sign in users?");
    }
    fs.writeFileSync(PENDING, JSON.stringify(request), { mode: 0o600 });

    console.log("");
    console.log("Open this while logged in as @valeries_apps — not as your main account:");
    console.log("");
    console.log(`    ${AUTHORIZE}?oauth_token=${request.oauth_token}`);
    console.log("");

    if (!pin) {
      if (stdin.isTTY) {
        pin = (await rl.question("The PIN X shows you: ")).trim();
      } else {
        console.log("Then run:  npm run authorize -- --pin <the PIN X shows you>");
        console.log("");
        process.exit(0);
      }
    }
  }

  const access = await step(ACCESS_TOKEN, {
    extra: { oauth_verifier: pin },
    token: request.oauth_token,
    tokenSecret: request.oauth_token_secret,
  });

  fs.rmSync(PENDING, { force: true });

  console.log("");
  console.log(`Authorised as @${access.screen_name} (id ${access.user_id}).`);
  if (access.screen_name && access.screen_name.toLowerCase() !== "valeries_apps") {
    console.log("");
    console.log("!! That is not @valeries_apps. Log out, log in as the right account, and run this again.");
  }
  console.log("");
  console.log("Put these in .env, and as repository secrets on valerie-announce:");
  console.log("");
  console.log(`X_ACCESS_TOKEN=${access.oauth_token}`);
  console.log(`X_ACCESS_SECRET=${access.oauth_token_secret}`);
  console.log("");
} catch (error) {
  console.error(error.message);
  if (/oauth_verifier/i.test(error.message)) {
    // The verifier is checked against the request token it was issued for, and
    // a request token is only good for a few minutes. Both failures come back
    // as this one sentence.
    console.error("");
    console.error("The PIN did not match the pending request. Either it was mistyped, or the");
    console.error("request token expired - they are short-lived. Run `npm run authorize`");
    console.error("again for a fresh link and redeem the PIN straight away.");
    fs.rmSync(PENDING, { force: true });
  }
  process.exitCode = 1;
} finally {
  rl.close();
}
