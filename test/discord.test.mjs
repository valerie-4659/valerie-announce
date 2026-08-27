// The Discord embed, against the release notes the hubs actually publish.
//
// The bodies below are copied from live releases. Discord has room X does not,
// so the interesting cases are the opposite ones from compose.test.mjs: what
// this channel is allowed to keep that the X post has to drop, and what it
// must drop anyway because length was never the reason.

import test from "node:test";
import assert from "node:assert/strict";
import {
  composeDiscordEmbed, composeRecapEmbed, announceAsset, webhookFromEnv,
  sendDiscord, MAX_DESCRIPTION, MAX_BULLETS,
} from "../src/discord.mjs";

// valerie-4659/crossposthelper-app, v1.25.0
const CROSSPOST = `### ✨ New

- Who follows whom is kept now, shown on each person's card and used when tagging
- The extension can re-read the following for everyone on the list in one go

### 🐛 Fixed

- A saved QT counts its age from when the post went out, not from when you saved it
- The browser panel stays open until you close it, instead of on every reload
- The following is read on a post page instead of always saying "not checked"
- Description popovers no longer run off the edge of a narrow panel

---

These builds are unsigned. macOS: right-click the app and choose Open.`;

const release = (over = {}) => ({
  app: "Crosspost Helper",
  tag: "v1.25.0",
  url: "https://github.com/valerie-4659/crossposthelper-app/releases/tag/v1.25.0",
  body: CROSSPOST,
  ...over,
});

test("keeps every bullet, which is the whole difference from the X post", () => {
  const { embed, source } = composeDiscordEmbed(release());
  assert.equal(source, "body");
  // Six bullets. The X composer stops at three because of a character budget
  // this channel does not have.
  //
  // The `u` flag is not decoration: 🐛 is astral, so without it the character
  // class is a set of surrogate halves and only the ✨ lines ever match.
  assert.equal((embed.description.match(/^[✨🐛⚡] /gmu) || []).length, 6);
  assert.match(embed.description, /Description popovers no longer run off/);
});

test("keeps a bullet too long to be an X headline", () => {
  // 82 characters — under SHORT_BULLET, but the point is that no length rule
  // applies here at all. A bullet is dropped for being unreadable, never for
  // being long, because nothing is being cut to fit.
  const long = "- " + "a".repeat(140);
  const { embed } = composeDiscordEmbed(release({ body: `### ✨ New\n\n${long}` }));
  assert.match(embed.description, /a{140}/);
});

test("still refuses a bare list, because length was never the reason", () => {
  // The guard that matters, carried over from the X composer: a release with
  // no sections has not been written for a reader, and what surfaces from it
  // is the commit log. imageworkflowhelper was one keystroke from announcing
  // "asarUnpack entries added for /node_modules/sharp/**/*" to the public.
  const bare = "- asarUnpack entries added for `/node_modules/sharp/**/*`\n- bump deps";
  const { embed } = composeDiscordEmbed(release({ body: bare }));
  assert.doesNotMatch(embed.description, /asarUnpack/);
  assert.match(embed.description, /Crosspost Helper v1\.25\.0/);
  assert.match(embed.description, /Download for Windows/);
});

test("stops at the horizontal rule, so the unsigned-builds warning is not news", () => {
  const { embed } = composeDiscordEmbed(release());
  assert.doesNotMatch(embed.description, /unsigned/i);
});

test("caps a changelog-sized release rather than pasting it into a chat", () => {
  const many = Array.from({ length: 40 }, (_, i) => `- bullet number ${i}`).join("\n");
  const { embed } = composeDiscordEmbed(release({ body: `### ✨ New\n\n${many}` }));
  assert.equal((embed.description.match(/^✨ /gmu) || []).length, MAX_BULLETS);
});

test("the lead line becomes the opening sentence when a release has one", () => {
  const withLead = `**Start from the picture** — open the picker with a picture already chosen.\n\n### ✨ New\n\n- One thing`;
  const { embed } = composeDiscordEmbed(release({ body: withLead }));
  assert.match(embed.description, /open the picker with a picture already chosen/);
});

test("an announcement the project wrote wins over the notes", () => {
  const announcement = {
    highlight: { title: "Who follows you back", sentence: "Every person on the list now shows which way the following goes" },
    sections: [
      { title: "✨ New", items: ["The people list says who follows you back"] },
      { title: "🐛 Fixed", items: ["A quote post found months late shows its real age"] },
    ],
  };
  const { embed, source } = composeDiscordEmbed(release({ announcement }));
  assert.equal(source, "announcement");
  assert.equal(embed.title, "Who follows you back");
  assert.match(embed.description, /which way the following goes/);
  assert.match(embed.description, /✨ The people list says who follows you back/);
  assert.match(embed.description, /🐛 A quote post found months late/);
  // And nothing from the body, which the announcement replaces outright.
  assert.doesNotMatch(embed.description, /Description popovers/);
});

test("the title falls back to the app and the version", () => {
  const { embed } = composeDiscordEmbed(release());
  assert.equal(embed.title, "Crosspost Helper v1.25.0");
  assert.equal(embed.author.name, "Crosspost Helper");
  assert.equal(embed.footer.text, "v1.25.0 · Windows · macOS · Linux");
});

test("a picture already on the release goes inline; no picture means no image key", () => {
  const withImage = composeDiscordEmbed(release({ imageUrl: "https://example.test/promo-1.png" }));
  assert.equal(withImage.embed.image.url, "https://example.test/promo-1.png");
  assert.equal("image" in composeDiscordEmbed(release()).embed, false);
});

test("an over-long description is truncated, never sent to be refused", () => {
  // A 400 from the webhook is an announcement nobody sees. A slightly short
  // embed is an announcement everybody sees.
  const huge = Array.from({ length: 12 }, () => `- ${"x".repeat(600)}`).join("\n");
  const { embed } = composeDiscordEmbed(release({ body: `### ✨ New\n\n${huge}` }));
  assert.ok(embed.description.length <= MAX_DESCRIPTION, embed.description.length);
  assert.ok(embed.description.endsWith("…"));
});

test("finds the announcement asset by name, and nothing else", () => {
  const assets = [
    { name: "promo-1.png" }, { name: "announce.json" }, { name: "promo-announce.json" },
  ];
  assert.equal(announceAsset({ assets }).name, "promo-announce.json");
  assert.equal(announceAsset({ assets: [{ name: "promo-post.txt" }] }), null);
  assert.equal(announceAsset({}), null);
});

test("the recap embed carries the same words as the X post", () => {
  const text = "Crosspost Helper — the last two weeks\n\n✨ Start from the picture\n🐛 Reading a quoted post keeps the name\n\n4 releases  https://example.test";
  const embed = composeRecapEmbed({ app: "Crosspost Helper", url: "https://example.test", text, releases: 4 });
  assert.equal(embed.title, "Crosspost Helper — the last two weeks");
  assert.match(embed.description, /✨ Start from the picture/);
  assert.equal(embed.footer.text, "4 releases");
});

test("a missing webhook is reported the way missing X credentials are", () => {
  assert.deepEqual(webhookFromEnv({}), { webhook: "", missing: ["DISCORD_WEBHOOK_URL"] });
  assert.deepEqual(webhookFromEnv({ DISCORD_WEBHOOK_URL: "  https://x.test  " }),
    { webhook: "https://x.test", missing: [] });
});

test("a rate limit is waited out once, then obeyed", async () => {
  const calls = [];
  let attempt = 0;
  const fetchImpl = async () => {
    attempt += 1;
    if (attempt === 1) {
      return { ok: false, status: 429, json: async () => ({ retry_after: 0.4 }) };
    }
    return { ok: true, status: 204 };
  };
  const result = await sendDiscord("https://x.test", { title: "t" }, {
    fetchImpl,
    wait: async (ms) => { calls.push(ms); },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [400]);
});

test("any other failure is raised, so the tag stays unrecorded and is retried", () => {
  const fetchImpl = async () => ({ ok: false, status: 404, text: async () => "no such webhook" });
  return assert.rejects(
    () => sendDiscord("https://x.test", { title: "t" }, { fetchImpl }),
    /404.*no such webhook/,
  );
});
