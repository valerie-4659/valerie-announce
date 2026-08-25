// What a release looks like once it has to fit in a post.
//
// The release bodies across the Valerie hubs are not one shape. Crosspost
// Helper writes "### ✨ New" with one-line bullets; metadatahelper writes
// "### Added" with bold prose; artqueue writes four-line sentences; xhelper
// writes German. A composer that trims whatever it finds to 280 characters
// produces a severed clause in the wrong language, which is worse than saying
// nothing about the contents at all.
//
// So there are two ways in. A release may carry its own post text, written by
// hand and uploaded next to the screenshots — that wins, verbatim. Otherwise
// this file composes one, and it only uses bullets it is confident about:
// short, single-line, no leftover markup. Anything longer is prose meant for a
// changelog, and it is dropped rather than cut.

/** X counts a link as this many characters, whatever its length. */
export const URL_WEIGHT = 23;
export const MAX_WEIGHT = 280;

/**
 * A bullet longer than this is prose, not a headline. Cutting it mid-sentence
 * is the failure this number exists to prevent, so it is deliberately strict:
 * every bullet Crosspost Helper has published fits, and every artqueue one does
 * not.
 */
export const SHORT_BULLET = 88;

/** How many bullets a post carries at most, however well they fit. */
export const MAX_BULLETS = 3;

/**
 * X does not count characters, it counts weighted code points: most of Latin,
 * Cyrillic and punctuation weigh 1, everything else — CJK, emoji — weighs 2.
 * Counting with `String.length` overshoots on emoji and undershoots on
 * astral pairs, and either way the post is rejected at the API with a message
 * about the text being too long. The ranges are twitter-text's.
 */
export function weight(text) {
  let total = 0;
  for (const character of String(text ?? "")) {
    const point = character.codePointAt(0);
    const light =
      (point >= 0 && point <= 4351) ||
      (point >= 8192 && point <= 8205) ||
      (point >= 8208 && point <= 8223) ||
      (point >= 8242 && point <= 8247);
    total += light ? 1 : 2;
  }
  return total;
}

/** The weight of a finished post, with every URL charged at X's flat rate. */
export function postWeight(text) {
  const urls = String(text ?? "").match(/https?:\/\/\S+/g) || [];
  const withoutUrls = String(text ?? "").replace(/https?:\/\/\S+/g, "");
  return weight(withoutUrls) + urls.length * URL_WEIGHT;
}

/**
 * Markdown, removed rather than escaped. A post shows its source: `**bold**`
 * arrives as four stray asterisks and `[ADR 0004](docs/adr/...)` arrives as a
 * path nobody can open, because the link is relative to a repo the reader is
 * not in.
 */
export function stripMarkdown(line) {
  return String(line ?? "")
    // [text](target) -> text. Done first, so the target's punctuation never
    // survives into the later passes.
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    // A path is not emphasis. "`**/node_modules/sharp/**/*`" came out of the
    // naive version as "/node_modules/sharp//*", which reads as gibberish in
    // a post, so a run containing a slash is left alone.
    .replace(/\*\*([^*\n\/]+)\*\*/g, "$1")
    .replace(/(^|\s)[*_]([^*_\n\/]+)[*_](?=\s|$|[.,;:!?])/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The emoji a section heading stands for. Crosspost Helper already writes the
 * emoji; the other apps write Keep a Changelog words, and a post reads better
 * with the same three marks everywhere than with a heading line spent on
 * "Added".
 */
/** The mark a bullet carries when nothing said which section it is in. */
export const UNKNOWN_SECTION = "•";

const SECTION_EMOJI = [
  [/✨|\bnew\b|\badded\b|\bfeatures?\b/i, "✨"],
  [/🐛|\bfixed\b|\bfixes\b|\bbugfix/i, "🐛"],
  [/⚡|\bfaster\b|\bperformance\b|\bchanged\b|\bimproved\b/i, "⚡"],
];

function emojiFor(heading) {
  for (const [pattern, emoji] of SECTION_EMOJI) {
    if (pattern.test(heading)) return emoji;
  }
  return UNKNOWN_SECTION;
}

/**
 * The bullets of a release body, each tagged with the section it stood under.
 *
 * Stops at a horizontal rule: every release built by the workflow appends the
 * unsigned-builds warning below one, and that warning is not news.
 */
export function bulletsFrom(body) {
  const lines = String(body ?? "").split(/\r?\n/);
  const bullets = [];
  let emoji = UNKNOWN_SECTION;
  let open = null;

  // A bullet is not a line. artqueue wraps one sentence over four of them, and
  // reading only the first produced "...every image page offers a" — a severed
  // clause that passed the length check precisely because it had been cut.
  const close = () => {
    if (!open) return;
    const text = finishBullet(open.text);
    if (text.text) bullets.push({ emoji: text.emoji ?? open.emoji, text: text.text });
    open = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      close();
      break;
    }
    if (/^#{1,6}\s/.test(line)) {
      close();
      emoji = emojiFor(line);
      continue;
    }
    if (!line) {
      close();
      continue;
    }
    const bullet = line.match(/^[-*+]\s+(.*)$/);
    if (bullet) {
      close();
      open = { emoji, text: bullet[1] };
      continue;
    }
    // An unmarked line under an open bullet is the rest of its sentence.
    if (open) open.text += ` ${line}`;
  }
  close();

  return bullets;
}

/**
 * One bullet, cleaned. "- Fixed: the thing" names its own section instead of
 * standing under a heading, which artqueue does and Crosspost Helper does not;
 * the name is read for its emoji and then dropped, because the emoji says it.
 */
function finishBullet(raw) {
  const text = stripMarkdown(raw);
  const inline = text.match(/^(new|added|fixed|changed|faster|improved)\s*[:—-]\s*(.*)$/i);
  if (!inline) return { text };
  return { emoji: emojiFor(inline[1]), text: inline[2].trim() };
}

/**
 * The bullets worth putting in a post: short, from a section this file
 * recognises, and no more than three.
 *
 * The section requirement is the important half. A release that groups its
 * notes under "### ✨ New" or "### Fixed" has been written for somebody to
 * read; one that is a bare list has not, and what surfaces from it is the
 * commit log — "asarUnpack entries added for /node_modules/sharp/**\/*" was a
 * real candidate for a public post. There is no way to tell news from
 * housekeeping inside such a list, so the whole list is left alone and the
 * post falls back to its headline. An app that wants bullets either adopts the
 * headings or writes the post itself.
 */
export function headlineBullets(bullets) {
  return bullets
    .filter((bullet) => bullet.emoji !== UNKNOWN_SECTION)
    .filter((bullet) => weight(bullet.text) <= SHORT_BULLET)
    .slice(0, MAX_BULLETS);
}

/**
 * The post.
 *
 * @param {object}  release
 * @param {string}  release.app       display name, e.g. "Crosspost Helper"
 * @param {string}  release.tag       e.g. "v1.19.0"
 * @param {string}  release.url       the release page on the hub
 * @param {string}  [release.body]    the release notes
 * @param {string}  [release.override] a post written by hand; used verbatim
 */
export function compose({ app, tag, url, body = "", override = "" }) {
  const handWritten = String(override ?? "").trim();
  if (handWritten) {
    // A hand-written post is used as it stands, including whether it carries a
    // link at all. Appending one would break a text somebody laid out on
    // purpose, and silently double the price of the post.
    return { text: handWritten, weight: postWeight(handWritten), source: "override" };
  }

  const header = `${app} ${tag}`;
  const chosen = headlineBullets(bulletsFrom(body));

  let text = header;
  const lines = [];
  for (const bullet of chosen) {
    const candidate = `${bullet.emoji} ${bullet.text}`;
    const next = [header, "", ...lines, candidate, "", url].join("\n");
    if (postWeight(next) > MAX_WEIGHT) break;
    lines.push(candidate);
  }

  text = lines.length ? [header, "", ...lines, "", url].join("\n") : [header, "", url].join("\n");
  return { text, weight: postWeight(text), source: lines.length ? "bullets" : "headline" };
}
