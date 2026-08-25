#!/usr/bin/env node
// Does the whole chain actually work?
//
// Run this after setting the secrets, and before any release depends on it.
// It answers the one question the documentation cannot: whether X accepts
// OAuth 1.0a on its v2 media endpoint, on its v1.1 one, or on neither. The
// forums disagree; this asks.
//
// It uploads a picture but posts nothing.

import { loadEnv } from "./env.mjs";
import { credentialsFromEnv, whoAmI, uploadMedia } from "./x.mjs";

loadEnv();

const { credentials, missing } = credentialsFromEnv();
if (missing.length) {
  console.error(`Missing: ${missing.join(", ")}`);
  process.exit(1);
}

// A 1x1 PNG, small enough to be uninteresting and real enough to be uploaded.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

try {
  const me = await whoAmI(credentials);
  console.log(`Signed in as @${me.username} (${me.name}).`);
  if (me.username?.toLowerCase() !== "valeries_apps") {
    console.log("!! These credentials post as the wrong account. Run `npm run authorize` again.");
  }

  const { mediaId, via } = await uploadMedia(credentials, {
    data: PIXEL,
    filename: "check.png",
    type: "image/png",
  });
  console.log(`Media upload works over ${via} (media_id ${mediaId}).`);
  console.log("");
  console.log("Nothing was posted. The chain is ready.");
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
