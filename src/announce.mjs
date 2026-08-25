#!/usr/bin/env node
// One run: find releases nobody has posted about yet, and post about them.
//
//   node src/announce.mjs --dry            compose everything, send nothing
//   node src/announce.mjs --only artqueue-app
//   node src/announce.mjs --seed           record today's releases as posted
//
// The guards matter more than the happy path. A first run against ten hubs
// would otherwise post ten announcements for versions that shipped months ago,
// and there is no way to unsend those.

import { loadEnv } from "./env.mjs";
import { discoverApps, latestRelease, namesFromAbout, promoImages, promoTextAsset, download } from "./github.mjs";
import { compose } from "./compose.mjs";
import { credentialsFromEnv, uploadMedia, post, priceOf } from "./x.mjs";
import { readState, writeState } from "./state.mjs";

loadEnv();

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const value = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index === -1 ? fallback : args[index + 1];
};

const options = {
  dry: has("--dry"),
  seed: has("--seed"),
  only: value("--only", null),
  maxPosts: Number(value("--max-posts", 3)),
  // A release older than this is history, not news. It is what stops a first
  // run — or a run after the state file is lost — from announcing the archive.
  maxAgeHours: Number(value("--max-age-hours", 72)),
  // Repositories that publish releases but are not app announcements.
  skip: (value("--skip", "") || "").split(",").filter(Boolean),
};

function log(...parts) {
  console.log(...parts);
}

async function main() {
  const state = await readState();
  const { credentials, missing } = credentialsFromEnv();
  const canPost = missing.length === 0;

  if (!canPost && !options.dry && !options.seed) {
    log(`No X credentials (${missing.join(", ")}). Composing only — nothing will be sent.`);
  }

  const [apps, names] = await Promise.all([discoverApps({ skip: options.skip }), namesFromAbout()]);
  const chosen = options.only ? apps.filter((app) => app.repo === options.only) : apps;
  if (options.only && chosen.length === 0) throw new Error(`No public repo called ${options.only}.`);

  log(`${chosen.length} repositories to check.`);

  const now = Date.now();
  const pending = [];

  for (const app of chosen) {
    const release = await latestRelease(app.repo);
    if (!release) continue;

    const name = names[app.repo] || app.name;
    const known = state[app.repo];
    if (known === release.tag) continue;

    const ageHours = (now - Date.parse(release.publishedAt)) / 3_600_000;
    // An --only run is somebody asking for this one on purpose, so the age
    // guard steps aside; an automatic run keeps it.
    const tooOld = ageHours > options.maxAgeHours && !options.only;

    pending.push({ ...release, name, ageHours, tooOld });
  }

  if (pending.length === 0) {
    log("Nothing new.");
    return;
  }

  // A release that is merely old is recorded rather than announced. That is
  // what keeps a first run - or a run after the state file is lost - from
  // announcing an archive, while a genuinely new app still gets its post.
  const toPost = [];
  for (const release of pending) {
    if (options.seed || release.tooOld) {
      log(`· ${release.name} ${release.tag} — recorded, not announced (${Math.round(release.ageHours)}h old)`);
      state[release.repo] = release.tag;
      continue;
    }
    toPost.push(release);
  }

  const capped = toPost.slice(0, options.maxPosts);
  if (toPost.length > capped.length) {
    log(`${toPost.length} releases to announce, posting ${capped.length} this run (--max-posts).`);
  }

  let spend = 0;
  for (const release of capped) {
    const textAsset = promoTextAsset(release);
    const override = textAsset ? (await download(textAsset.url)).toString("utf8") : "";
    const images = promoImages(release);
    const { text, weight, source } = compose({
      app: release.name,
      tag: release.tag,
      url: release.url,
      body: release.body,
      override,
    });

    const price = priceOf(text);
    spend += price;

    log("");
    log(`--- ${release.repo} (${source}, ${weight}/280 characters, $${price.toFixed(3)}, ${images.length} picture(s))`);
    log(text.split("\n").map((line) => `    ${line}`).join("\n"));

    if (options.dry || !canPost) continue;

    const mediaIds = [];
    for (const image of images) {
      try {
        const data = await download(image.url);
        const { mediaId, via } = await uploadMedia(credentials, {
          data,
          filename: image.name,
          type: image.contentType || "image/png",
        });
        mediaIds.push(mediaId);
        log(`    attached ${image.name} (${via})`);
      } catch (error) {
        // Deliberately not fatal: the announcement is the point, the picture
        // is the garnish.
        log(`    could not attach ${image.name}: ${error.message}`);
      }
    }

    const posted = await post(credentials, { text, mediaIds });
    log(`    posted: https://x.com/valeries_apps/status/${posted.id}`);
    state[release.repo] = release.tag;
  }

  if (options.dry) {
    log("");
    log(`Dry run. Nothing was posted and the state file was not written. Would have spent $${spend.toFixed(2)}.`);
    return;
  }

  await writeState(state);
  if (spend > 0) log(`\nSpent about $${spend.toFixed(2)} with X.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
