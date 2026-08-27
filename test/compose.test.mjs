// Composing a post, tested against the release notes the hubs actually publish.
//
// The bodies below are copied from live releases, not invented. They are the
// reason this file exists: four apps, four house styles, one composer.

import test from "node:test";
import assert from "node:assert/strict";
import {
  compose, bulletsFrom, stripMarkdown, weight, postWeight, MAX_WEIGHT,
  highlightFrom, composeRecap,
} from "../src/compose.mjs";

// valerie-4659/crossposthelper-app, v1.19.0
const CROSSPOST = `### ✨ New

- A filmstrip, so a decision can be judged against its neighbours
- A 30s cooldown after posting, to rule out a double post

### 🐛 Fixed

- Move the mark badge down by the buttons, not the top corner

---

These builds are unsigned. macOS: right-click the app and choose Open. Windows: More info, then Run anyway.`;

// valerie-4659/artqueue-app, v2.3.1 — one bullet, four lines of prose.
const ARTQUEUE = `- Fixed: CivitAI downloads saved the wrong picture. Every image page offers a
  generated 1200x630 share card — the artwork as a small thumbnail on a dark
  background with "Image on Civitai", the author and the reaction counts drawn
  onto it — as its Open Graph preview, and that card was what got saved.`;

// valerie-4659/xhelper-app, v0.7.0 — German, bold, a relative markdown link.
const XHELPER = `- **Die Sperre ist weg.** Kein Freigabe-Deckel mehr pro Register: kein schraffiertes Band über dem Pad ([ADR 0004](docs/adr/0004-no-permission-ceiling.md)).`;

// valerie-4659/metadatahelper-app, v1.3.0 — Keep a Changelog words, no emoji.
const METADATA = `### Added
- **User Guide modal** — a "? Guide" button in the centre of the footer bar opens an inline User Guide.
- **Click-outside-to-close** — clicking the backdrop closes the modal.`;

const HUB = "https://github.com/valerie-4659/crossposthelper-app/releases/tag/v1.19.0";

test("a link counts as 23 characters however long it is", () => {
  const short = postWeight("a https://x.co/1");
  const long = postWeight(`a ${"https://github.com/valerie-4659/crossposthelper-app/releases/tag/v1.19.0"}`);
  assert.equal(short, long);
  assert.equal(short, 2 + 23);
});

test("an emoji weighs two, a letter weighs one", () => {
  assert.equal(weight("abc"), 3);
  assert.equal(weight("✨"), 2);
  // Astral pair: one character to a reader, one code point here, weight two.
  assert.equal(weight("🐛"), 2);
});

test("markdown is removed, not shown", () => {
  assert.equal(stripMarkdown("**Die Sperre ist weg.** Kein Deckel"), "Die Sperre ist weg. Kein Deckel");
  assert.equal(stripMarkdown("a [ADR 0004](docs/adr/0004.md) b"), "a ADR 0004 b");
  assert.equal(stripMarkdown("use `npm run dev`"), "use npm run dev");
});

test("the bullets of a release carry the emoji of their section", () => {
  const bullets = bulletsFrom(CROSSPOST);
  assert.equal(bullets.length, 3);
  assert.equal(bullets[0].emoji, "✨");
  assert.equal(bullets[2].emoji, "🐛");
  assert.equal(bullets[2].text, "Move the mark badge down by the buttons, not the top corner");
});

test("the unsigned-builds footer below the rule is not news", () => {
  const bullets = bulletsFrom(CROSSPOST);
  assert.ok(!bullets.some((bullet) => /unsigned/i.test(bullet.text)));
});

test("a section written as a word gets the same emoji as one written as an emoji", () => {
  const bullets = bulletsFrom(METADATA);
  assert.equal(bullets[0].emoji, "✨");
});

test("a section named inside the bullet is read and then dropped", () => {
  const [bullet] = bulletsFrom("- Fixed: the thing broke");
  assert.equal(bullet.emoji, "🐛");
  assert.equal(bullet.text, "the thing broke");
});

test("a well-formed release becomes a post with its bullets", () => {
  const post = compose({ app: "Crosspost Helper", tag: "v1.19.0", url: HUB, body: CROSSPOST });
  assert.equal(post.source, "bullets");
  assert.ok(post.text.startsWith("Crosspost Helper v1.19.0"));
  assert.ok(post.text.includes("✨ A filmstrip"));
  assert.ok(post.text.endsWith(HUB));
  assert.ok(post.weight <= MAX_WEIGHT, `${post.weight} > ${MAX_WEIGHT}`);
});

test("prose bullets are dropped whole rather than cut mid-sentence", () => {
  // The failure this guards against is a post that ends "...and that card was
  // what got sav", in the middle of a clause, under an app's name.
  const post = compose({ app: "ArtQueue", tag: "v2.3.1", url: HUB, body: ARTQUEUE });
  assert.equal(post.source, "headline");
  assert.equal(post.text, `ArtQueue v2.3.1\n\n${HUB}`);
});

test("a German release is not half-translated into a severed clause", () => {
  const post = compose({ app: "XHelper", tag: "v0.7.0", url: HUB, body: XHELPER });
  assert.equal(post.source, "headline");
  assert.ok(!post.text.includes("ADR"), post.text);
  assert.ok(!post.text.includes("**"), post.text);
});

test("an empty body still produces a post", () => {
  const post = compose({ app: "Pixxie", tag: "v1.0.0", url: HUB, body: null });
  assert.equal(post.source, "headline");
  assert.ok(post.text.includes("Pixxie v1.0.0"));
});

test("a hand-written post is used exactly as it stands", () => {
  const override = "Crosspost Helper can now split a picture across four posts.\n\nhttps://example.com";
  const post = compose({ app: "Crosspost Helper", tag: "v1.19.0", url: HUB, body: CROSSPOST, override });
  assert.equal(post.source, "override");
  assert.equal(post.text, override);
  // The hub link is not appended: a second link would double what X bills.
  assert.ok(!post.text.includes(HUB));
});

test("no composed post can exceed what X accepts", () => {
  const many = Array.from({ length: 12 }, (_, index) => `- Bullet number ${index} that is a reasonable length`).join("\n");
  const post = compose({ app: "A Very Long Application Name Indeed", tag: "v10.20.30", url: HUB, body: `### ✨ New\n${many}` });
  assert.ok(post.weight <= MAX_WEIGHT, `${post.weight} > ${MAX_WEIGHT}: ${post.text}`);
});

// valerie-4659/imageworkflowhelper-app, v0.5.1 — a bare list, no headings,
// written for the commit log rather than for a reader.
const HOUSEKEEPING = `- asarUnpack entries added for \`**/node_modules/sharp/**/*\` and \`**/node_modules/@img/**/*\`.
- Rebuilt the installer.`;

test("a release with no section headings contributes no bullets", () => {
  const post = compose({ app: "Image Workflow Helper", tag: "v0.5.1", url: HUB, body: HOUSEKEEPING });
  assert.equal(post.source, "headline");
  assert.ok(!post.text.includes("asarUnpack"), post.text);
});

test("a glob is not read as emphasis", () => {
  // The naive strip turned "**/node_modules/sharp/**/*" into
  // "/node_modules/sharp//*" — three stray characters that read as a typo.
  assert.equal(stripMarkdown("`**/node_modules/sharp/**/*`"), "**/node_modules/sharp/**/*");
  // Ordinary bold still goes.
  assert.equal(stripMarkdown("**User Guide modal** — a button"), "User Guide modal — a button");
});

// The fortnightly recap.

test("the lead line of a release is read as its headline", () => {
  const body = "**Start from the picture** — Open the picker with a picture already chosen.\n\n### ✨ New\n\n- Pick first\n";
  assert.deepEqual(highlightFrom(body), {
    title: "Start from the picture",
    sentence: "Open the picker with a picture already chosen",
  });
});

test("a lead with no sentence after it is still a headline", () => {
  assert.deepEqual(highlightFrom("**Start from the picture**\n\n### ✨ New\n"), {
    title: "Start from the picture",
    sentence: "",
  });
});

test("bold inside a section is not the release's headline", () => {
  // Only the line above the first heading is the lead. A section that opens
  // with bold prose — which metadatahelper's releases do — is not it.
  assert.equal(highlightFrom("### Added\n\n**Something bold** in a section\n"), null);
  assert.equal(highlightFrom("### ✨ New\n\n- A bullet\n"), null);
  assert.equal(highlightFrom(""), null);
});

test("a recap names one change per release, newest first", () => {
  const recap = composeRecap({
    app: "Crosspost Helper",
    url: "https://github.com/valerie-4659/crossposthelper-app/releases",
    releases: [
      { body: "**Start from the picture** — Open the picker with one already chosen.\n\n### ✨ New\n\n- x\n" },
      { body: "### ✨ New\n\n- Filter the shelf by where a picture came from\n" },
    ],
  });
  const lines = recap.text.split("\n");
  assert.equal(lines[0], "Crosspost Helper — the last two weeks");
  assert.equal(lines[2], "✨ Start from the picture");
  assert.equal(lines[3], "✨ Filter the shelf by where a picture came from");
  assert.ok(recap.text.endsWith("2 releases  https://github.com/valerie-4659/crossposthelper-app/releases"));
  assert.ok(recap.weight <= MAX_WEIGHT);
});

test("a release nobody can read contributes no line but is still counted", () => {
  // "6 releases" and six lines are different claims, and only one is true.
  const recap = composeRecap({
    app: "App",
    url: "https://example.com/releases",
    releases: [
      { body: "**A real headline** — with a sentence.\n" },
      { body: "asarUnpack entries added for /node_modules/sharp\n" },
      { body: "" },
    ],
  });
  assert.equal(recap.lines, 1);
  assert.equal(recap.releases, 3);
  assert.ok(recap.text.includes("3 releases"));
});

test("nothing readable means no recap at all", () => {
  assert.equal(composeRecap({ app: "App", url: "https://example.com", releases: [{ body: "no headings, no lead" }] }), null);
  assert.equal(composeRecap({ app: "App", url: "https://example.com", releases: [] }), null);
});

test("a recap never exceeds what X accepts", () => {
  const releases = Array.from({ length: 8 }, (_, i) => ({ body: `**${"h".repeat(60)} ${i}** — s.\n` }));
  const recap = composeRecap({ app: "Crosspost Helper", url: "https://github.com/valerie-4659/x/releases", releases });
  assert.ok(recap.weight <= MAX_WEIGHT, `${recap.weight} weighted characters`);
  assert.ok(recap.lines >= 1);
});

test("one release reads as one release", () => {
  const recap = composeRecap({ app: "App", url: "https://example.com", releases: [{ body: "**One thing** — s.\n" }] });
  assert.ok(recap.text.includes("1 release  "));
  assert.ok(!recap.text.includes("1 releases"));
});
