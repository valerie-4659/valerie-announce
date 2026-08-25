#!/usr/bin/env node
// One post, written by hand.
//
// Everything else here is composed from a release. This is the way to say
// something that is not one: the account's first post introducing itself, a
// note that a download is broken, an answer. It reads nothing, writes nothing
// to `state/`, and knows nothing about apps — text in, post out.
//
// Sending is opt-in. Without `--send` it prints exactly what would go out and
// what it would cost, which is the same bargain `--dry` makes everywhere else
// in this repository: the expensive direction is never the default one.
//
//   node src/say.mjs --file intro.txt
//   node src/say.mjs --file intro.txt --send
//   node src/say.mjs --text "..." --image shot.png --send

import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "./env.mjs";
import { postWeight, MAX_WEIGHT } from "./compose.mjs";
import { credentialsFromEnv, whoAmI, uploadMedia, post, priceOf } from "./x.mjs";

loadEnv();

const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const value = (name, fallback = null) => {
  const at = args.indexOf(name);
  return at === -1 || at === args.length - 1 ? fallback : args[at + 1];
};
/** `--image` may appear more than once; X takes four at most. */
const values = (name) =>
  args.flatMap((arg, at) => (arg === name && at < args.length - 1 ? [args[at + 1]] : []));

const send = has("--send");
const file = value("--file");
const text = (file ? fs.readFileSync(file, "utf8") : value("--text", "")).trim();
const images = values("--image");

if (!text) {
  console.error("Nothing to post. Give it --text or --file.");
  process.exit(1);
}

// X counts weighted code points and charges every link a flat 23, so the count
// has to be its own — compose.mjs already does it for release posts. Being told
// here at 281 beats a 400 from the API.
const posted = postWeight(text);
if (posted > MAX_WEIGHT) {
  console.error(`${posted} of ${MAX_WEIGHT} — too long by ${posted - MAX_WEIGHT}.`);
  process.exit(1);
}

console.log("─".repeat(60));
console.log(text);
console.log("─".repeat(60));
for (const image of images) console.log(`picture: ${path.basename(image)}`);
console.log(`${posted}/${MAX_WEIGHT} characters · $${priceOf(text).toFixed(3)}`);

if (!send) {
  console.log("\nNothing was sent. Add --send to post it.");
  process.exit(0);
}

const { credentials, missing } = credentialsFromEnv();
if (missing.length) {
  console.error(`Missing: ${missing.join(", ")}`);
  process.exit(1);
}

// Which account this posts as, before it posts — the tokens are static and
// nothing else in the run would notice they belong to the wrong one.
const me = await whoAmI(credentials);
console.log(`\nPosting as @${me.username}.`);

const mediaIds = [];
for (const image of images.slice(0, 4)) {
  const { mediaId, via } = await uploadMedia(credentials, {
    data: fs.readFileSync(image),
    filename: path.basename(image),
    type: image.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
  });
  console.log(`  ${path.basename(image)} uploaded over ${via}.`);
  mediaIds.push(mediaId);
}

const result = await post(credentials, { text, mediaIds });
console.log(`Posted: https://x.com/${me.username}/status/${result.id}`);
