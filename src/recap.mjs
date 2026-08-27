#!/usr/bin/env node
// The fortnightly recap: one post per app, saying what shipped since the last one.
//
//   node src/recap.mjs --dry             compose every due recap, send nothing
//   node src/recap.mjs --only crossposthelper-app --dry
//   node src/recap.mjs --seed            record today as recapped, post nothing
//
// A release announcement reaches whoever happened to be scrolling that hour.
// The recap is for everyone else, and it is the only post on the account that
// is about an app rather than about a version of it.
//
// It is deliberately quiet. An app with no release in the window gets no post,
// and neither does one whose releases say nothing a stranger can read: a
// fortnightly "nothing to report" costs $0.20 and teaches people to scroll past
// the account. Silence is the correct output most fortnights for most apps.

import { loadEnv } from "./env.mjs";
import { discoverApps, releasesSince, namesFromAbout, promoImages, download } from "./github.mjs";
import { composeRecap } from "./compose.mjs";
import { credentialsFromEnv, uploadMedia, post, priceOf } from "./x.mjs";
import { composeRecapEmbed, sendDiscord, webhookFromEnv } from "./discord.mjs";
import { readRecapState, writeRecapState } from "./state.mjs";

loadEnv();

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const value = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index === -1 ? fallback : args[index + 1];
};

const DAY = 86_400_000;

const options = {
  dry: has("--dry"),
  seed: has("--seed"),
  only: value("--only", null),
  /** How often an app may be recapped. The schedule runs weekly; this is the gate. */
  everyDays: Number(value("--every-days", 14)),
  /**
   * The furthest back a window may reach. Without it, a first run — or one
   * after the state file is lost — would recap an app's entire history as if
   * it were news, which is the same failure the announcement's age guard
   * exists to prevent and just as impossible to unsend.
   */
  maxWindowDays: Number(value("--max-window-days", 28)),
  skip: (value("--skip", "") || "").split(",").filter(Boolean),
  noX: has("--no-x"),
  noDiscord: has("--no-discord"),
};

function log(...parts) {
  console.log(...parts);
}

/** "the last two weeks", or the truth when a run was missed and it was longer. */
function windowName(days) {
  const weeks = Math.round(days / 7);
  if (weeks <= 1) return "the last week";
  if (weeks === 2) return "the last two weeks";
  if (weeks === 3) return "the last three weeks";
  return `the last ${weeks} weeks`;
}

async function main() {
  const state = await readRecapState();
  const { credentials, missing } = credentialsFromEnv();
  const { webhook, missing: webhookMissing } = webhookFromEnv();
  const canPost = missing.length === 0 && !options.noX;
  const canDiscord = webhookMissing.length === 0 && !options.noDiscord;

  if (!canPost && !options.noX && !options.dry && !options.seed) {
    log(`No X credentials (${missing.join(", ")}). Composing only — nothing will be sent to X.`);
  }
  if (!canDiscord && !options.noDiscord && !options.dry && !options.seed) {
    log(`No Discord webhook (${webhookMissing.join(", ")}). Composing only — nothing will be sent there.`);
  }

  const [apps, names] = await Promise.all([discoverApps({ skip: options.skip }), namesFromAbout()]);
  const chosen = options.only ? apps.filter((app) => app.repo === options.only) : apps;
  if (options.only && chosen.length === 0) throw new Error(`No public repo called ${options.only}.`);

  log(`${chosen.length} repositories to check.`);

  const now = Date.now();
  let spend = 0;
  let posted = 0;

  for (const app of chosen) {
    const last = state[app.repo] ? Date.parse(state[app.repo]) : 0;
    const sinceLast = last ? (now - last) / DAY : Infinity;

    // An --only run is somebody asking for this one on purpose, so the cadence
    // gate steps aside; a scheduled run keeps it.
    if (sinceLast < options.everyDays && !options.only) continue;

    const windowDays = Math.min(Number.isFinite(sinceLast) ? sinceLast : options.everyDays, options.maxWindowDays);
    const since = new Date(now - windowDays * DAY).toISOString();
    const releases = await releasesSince(app.repo, since);
    const name = names[app.repo] || app.name;

    if (options.seed) {
      state[app.repo] = new Date(now).toISOString();
      log(`· ${name} — recorded as recapped, nothing posted`);
      continue;
    }

    if (!releases.length) {
      // Nothing shipped. The clock is deliberately not reset: an app that ships
      // in week three should be recapped then, not held until the fortnight
      // after, and leaving the date alone is what makes the next run pick it up.
      log(`· ${name} — nothing shipped in ${Math.round(windowDays)} days`);
      continue;
    }

    const recap = composeRecap({
      app: name,
      url: `https://github.com/valerie-4659/${app.repo}/releases`,
      releases,
      since: windowName(windowDays),
    });

    if (!recap) {
      log(`· ${name} — ${releases.length} release(s), none of them readable as a headline`);
      continue;
    }

    // The pictures the newest release already carried. They are what stops X
    // rendering its own preview card, which names the repository and not the
    // app — the whole reason a release takes screenshots in the first place.
    const images = promoImages(releases[0]);
    // What X would charge. Zero when X is not a channel this run, so the
    // figure printed at the end is a claim about money that will move.
    const price = options.noX ? 0 : priceOf(recap.text);
    spend += price;

    log("");
    log(`--- ${app.repo} (${recap.lines} of ${recap.releases} releases, ${recap.weight}/280, $${price.toFixed(3)}, ${images.length} picture(s))`);
    log(recap.text.split("\n").map((line) => `    ${line}`).join("\n"));

    if (options.dry) continue;

    // The same fortnight on both channels. A reader who follows both should
    // see one message twice rather than two accounts of the same two weeks,
    // so Discord is given the text the X post was composed from.
    let reached = false;

    if (canPost) {
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
          // Not fatal. The recap is the point, the picture is the garnish.
          log(`    could not attach ${image.name}: ${error.message}`);
        }
      }

      const sent = await post(credentials, { text: recap.text, mediaIds });
      log(`    posted: https://x.com/valeries_apps/status/${sent.id}`);
      reached = true;
    }

    if (canDiscord) {
      try {
        await sendDiscord(webhook, composeRecapEmbed({
          app: name,
          url: `https://github.com/valerie-4659/${app.repo}/releases`,
          text: recap.text,
          releases: recap.releases,
        }));
        log("    Discord: sent");
        reached = true;
      } catch (error) {
        log(`    Discord: ${error.message}`);
      }
    }

    // The clock moves only if somebody was actually told. A fortnight recorded
    // as recapped after both channels failed is a fortnight nobody hears about
    // and nothing ever retries.
    if (!reached) continue;
    state[app.repo] = new Date(now).toISOString();
    posted += 1;
  }

  if (options.dry) {
    log("");
    log(`Dry run. Nothing was posted and the state file was not written. Would have spent $${spend.toFixed(2)}.`);
    return;
  }

  await writeRecapState(state);
  log("");
  log(posted ? `Posted ${posted} recap(s), about $${spend.toFixed(2)} with X. Discord costs nothing.` : "No recap was due.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
