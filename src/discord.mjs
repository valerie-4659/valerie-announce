// The other channel. Same release, said with more room.
//
// X and Discord are one announcement twice over, and the difference between
// them is only what each medium can hold. X charges $0.20 for a post with a
// link and refuses it at 281 weighted characters, so three short bullets ride
// at most and everything else is dropped. A Discord webhook costs nothing,
// renders an embed and allows 4096 characters, so nothing has to be dropped
// and the screenshot goes inline rather than as an attachment.
//
// **Every app, no setup.** This used to live in each project's own release
// workflow, which meant a webhook secret, a script and a documented step per
// repository — and a new app announced nothing on Discord until somebody
// remembered all three. Here it is one webhook for the account: an app is
// covered the day it publishes its first release, the same day X covers it.
//
// Two ways in, mirroring the composer next door. A release that carries a
// `promo-announce.json` asset — written by the project when its notes were
// written — is used as it stands, because that text was composed for a reader
// rather than derived from headings. Otherwise the release body is read, by
// the same parser the X post uses.

import { bulletsFrom, highlightFrom, stripMarkdown, UNKNOWN_SECTION } from "./compose.mjs";

/** What a webhook embed's description may hold. Discord's own limit. */
export const MAX_DESCRIPTION = 4096;

/**
 * How many bullets an embed carries.
 *
 * Not three, the way the X post is held: the reason for that number is a
 * character budget this channel does not have. It is not unlimited either —
 * a release with forty bullets is a changelog, and pasting a changelog into a
 * chat channel is how a channel gets muted.
 */
export const MAX_BULLETS = 12;

/** The blue the embed's stripe is drawn in — the app mark's accent. */
export const EMBED_COLOR = 7395071;

/** The asset a project uploads when it wrote its own announcement. */
export const ANNOUNCE_ASSET = /^promo-announce\.json$/i;

const SECTION_EMOJI = { "✨ New": "✨", "🐛 Fixed": "🐛", "⚡ Faster": "⚡" };

/** Blocks into a description, one blank line between, empties dropped. */
const paragraphs = (blocks) => blocks.map((b) => String(b ?? "").trim()).filter(Boolean).join("\n\n");

/** The announcement a project wrote for itself, if it attached one. */
export function announceAsset(release) {
  return (release?.assets || []).find((asset) => ANNOUNCE_ASSET.test(asset.name)) || null;
}

/**
 * The description, from what the project wrote.
 *
 * `announce.json` carries a highlight and sections that were written to be
 * read by a stranger, which is a different thing from release notes that
 * happen to be readable. When it is there it wins outright.
 */
function fromAnnouncement({ tag, url, announcement }) {
  const blocks = [`**${tag}**`, String(announcement?.highlight?.sentence ?? "").trim()];
  for (const section of announcement?.sections ?? []) {
    const mark = SECTION_EMOJI[section.title] ?? "•";
    const items = (section.items ?? [])
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
      .map((item) => `${mark} ${item}`);
    if (items.length) blocks.push(items.join("\n"));
  }
  blocks.push(downloadLine(url));
  return paragraphs(blocks);
}

/**
 * The description, from the published release notes.
 *
 * The section requirement is kept from the X composer, and for the same
 * reason: a release grouped under "✨ New" or "### Fixed" was written for
 * somebody to read, a bare list was not, and what surfaces from a bare list is
 * the commit log. The length cap is *not* kept — that one is X's budget, and a
 * bullet too long to be a headline is still perfectly readable in a chat
 * message.
 */
function fromBody({ app, tag, url, body }) {
  const lead = highlightFrom(body);
  const bullets = bulletsFrom(body)
    .filter((bullet) => bullet.emoji !== UNKNOWN_SECTION)
    .slice(0, MAX_BULLETS);

  const blocks = [`**${app} ${tag}**`];
  if (lead?.sentence) blocks.push(lead.sentence);
  else if (lead?.title) blocks.push(lead.title);
  if (bullets.length) blocks.push(bullets.map((b) => `${b.emoji} ${b.text}`).join("\n"));
  blocks.push(downloadLine(url));
  return paragraphs(blocks);
}

const downloadLine = (url) => `[:inbox_tray: Download for Windows, macOS and Linux](${url})`;

/**
 * The whole embed for one release.
 *
 * @param {object}  release
 * @param {string}  release.app        display name, e.g. "Crosspost Helper"
 * @param {string}  release.tag        e.g. "v1.25.0"
 * @param {string}  release.url        the release page on the hub
 * @param {string}  [release.body]     the published release notes
 * @param {object}  [release.announcement]  a parsed promo-announce.json
 * @param {string}  [release.imageUrl] a picture already on the release
 */
export function composeDiscordEmbed({ app, tag, url, body = "", announcement = null, imageUrl = "" }) {
  const source = announcement ? "announcement" : "body";
  const description = announcement
    ? fromAnnouncement({ tag, url, announcement })
    : fromBody({ app, tag, url, body });

  const title = stripMarkdown(announcement?.highlight?.title || "") || `${app} ${tag}`;

  return {
    embed: {
      // The app's name where Discord renders the source of the message: an
      // embed that opens with a version number has to say a version of what.
      author: { name: app },
      title,
      url,
      // Truncated rather than refused. A description over the limit is a
      // release with an unusual number of bullets, and a slightly short embed
      // beats a webhook rejected with a 400 and an announcement nobody sees.
      description: description.length > MAX_DESCRIPTION
        ? `${description.slice(0, MAX_DESCRIPTION - 1)}…`
        : description,
      color: EMBED_COLOR,
      footer: { text: `${tag} · Windows · macOS · Linux` },
      ...(imageUrl ? { image: { url: imageUrl } } : {}),
    },
    source,
  };
}

/**
 * The recap, as an embed.
 *
 * The X recap is one text under a 280-character ceiling; here the same lines
 * need no ceiling, so the whole thing is passed through as it was composed.
 * Deliberately the same words on both channels — a reader who follows both
 * should see one message twice, not two accounts of the same fortnight.
 */
export function composeRecapEmbed({ app, url, text, releases }) {
  const [header, ...rest] = String(text ?? "").split("\n");
  const body = rest.join("\n").trim();
  return {
    author: { name: app },
    title: header.trim() || app,
    url,
    description: body.length > MAX_DESCRIPTION ? `${body.slice(0, MAX_DESCRIPTION - 1)}…` : body,
    color: EMBED_COLOR,
    footer: { text: `${releases} release${releases === 1 ? "" : "s"}` },
  };
}

/** The webhook, or what is missing. Shaped like credentialsFromEnv() next door. */
export function webhookFromEnv(env = process.env) {
  const webhook = String(env.DISCORD_WEBHOOK_URL ?? "").trim();
  return { webhook, missing: webhook ? [] : ["DISCORD_WEBHOOK_URL"] };
}

/**
 * Send one embed.
 *
 * Discord answers 204 with no body on success. A 429 carries the wait in the
 * body rather than only in a header, so it is read and obeyed once — the
 * announcer posts a handful of messages per run, and a single retry is the
 * difference between a rate limit costing an announcement and costing a
 * second.
 */
export async function sendDiscord(webhook, embed, { fetchImpl = fetch, wait = sleep } = {}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetchImpl(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
    if (response.ok) return { ok: true, status: response.status };
    if (response.status === 429 && attempt === 0) {
      const body = await response.json().catch(() => ({}));
      await wait(Math.min(Number(body.retry_after ?? 1) * 1000, 10_000));
      continue;
    }
    const text = await response.text().catch(() => "");
    throw new Error(`Discord webhook failed with ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
  throw new Error("Discord webhook was rate limited twice.");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
