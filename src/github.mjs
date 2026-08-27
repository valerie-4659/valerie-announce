// Reading the hubs.
//
// Every repository this touches is public, so a token is optional and only
// buys a higher rate limit. Nothing here writes to GitHub except the state
// file, and that is committed by the workflow, not from here.

const API = "https://api.github.com";
const OWNER = "valerie-4659";

/** Assets whose name starts with this are for the post, not for users. */
const PROMO_PREFIX = "promo-";
const PROMO_IMAGE = /^promo-.*\.(png|jpe?g|webp)$/i;
const PROMO_TEXT = /^promo-post\.txt$/i;

function headers() {
  const token = process.env.GITHUB_TOKEN;
  return {
    accept: "application/vnd.github+json",
    "user-agent": "valerie-announce",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

async function api(path) {
  const response = await fetch(`${API}${path}`, { headers: headers() });
  if (response.status === 404) return null;
  if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
    // Unauthenticated GitHub allows 60 requests an hour, and eleven repos plus
    // their releases gets there in two runs. The workflow passes a token; a
    // run by hand needs one in .env, and saying so beats a 403 body.
    const resets = Number(response.headers.get("x-ratelimit-reset") || 0) * 1000;
    const minutes = Math.max(1, Math.ceil((resets - Date.now()) / 60_000));
    throw new Error(
      `GitHub rate limit reached (${minutes} min to go). Set GITHUB_TOKEN in .env - ` +
        "`gh auth token --user valerie-4659` prints one.",
    );
  }
  if (!response.ok) {
    throw new Error(`GitHub ${response.status} on ${path}: ${(await response.text()).slice(0, 200)}`);
  }
  return response.json();
}

/**
 * Every public repository of the account that has ever published a release.
 *
 * Deliberately not a hand-kept list: a list is a thing to forget when the
 * eighth app ships. A repository with no releases is not an app for these
 * purposes — that rules out valerie-about, the profile repo and anything
 * experimental without anyone having to say so.
 */
export async function discoverApps({ skip = [] } = {}) {
  const repos = [];
  for (let page = 1; page <= 5; page += 1) {
    const batch = await api(`/users/${OWNER}/repos?per_page=100&page=${page}&type=public`);
    if (!batch?.length) break;
    repos.push(...batch);
    if (batch.length < 100) break;
  }

  return repos
    .filter((repo) => !repo.archived && !repo.fork)
    .filter((repo) => !skip.includes(repo.name))
    .map((repo) => ({ repo: repo.name, name: displayName(repo), description: repo.description || "" }));
}

/**
 * What to call the app in a post.
 *
 * The hub descriptions all begin with the product name followed by an em dash
 * — "XHelper — downloads, documentation and support." — so the name is already
 * written down in a place that cannot drift out of date the way a second list
 * would. `about.json` overrides it where the two disagree, because that is the
 * name the apps themselves show.
 */
export function displayName(repo) {
  const fromDescription = String(repo.description || "").split("—")[0].trim();
  if (fromDescription && fromDescription.length <= 40) return fromDescription;
  return repo.name.replace(/-app$/, "");
}

/** The names the apps use for themselves, keyed by hub repository. */
export async function namesFromAbout() {
  const response = await fetch(
    `https://raw.githubusercontent.com/${OWNER}/valerie-about/main/about.json`,
    { headers: { "user-agent": "valerie-announce" } },
  );
  if (!response.ok) return {};
  const about = await response.json();
  const names = {};
  for (const app of about.apps || []) {
    const repo = String(app.url || "").replace(/\/+$/, "").split("/").pop();
    if (repo && app.name) names[repo] = app.name;
  }
  return names;
}

/**
 * The newest published release of a repository, or null.
 *
 * `/releases/latest` skips drafts and pre-releases on GitHub's side, which is
 * the behaviour wanted here: a pre-release is not something to announce.
 */
export async function latestRelease(repo) {
  const release = await api(`/repos/${OWNER}/${repo}/releases/latest`);
  if (!release) return null;
  return {
    repo,
    tag: release.tag_name,
    url: release.html_url,
    body: release.body || "",
    publishedAt: release.published_at,
    assets: (release.assets || []).map((asset) => ({
      name: asset.name,
      url: asset.browser_download_url,
      size: asset.size,
      contentType: asset.content_type,
    })),
  };
}

/**
 * Every published release of a repository since a moment, newest first.
 *
 * `/releases/latest` answers the announcement's question — what is the newest
 * thing nobody has posted about. The recap asks a different one: what shipped
 * in a fortnight, which is nearly always more than one release and sometimes
 * none. Drafts and pre-releases are dropped here, because this endpoint,
 * unlike `/latest`, returns them.
 */
export async function releasesSince(repo, sinceIso) {
  const since = Date.parse(sinceIso);
  const found = [];
  for (let page = 1; page <= 3; page += 1) {
    const batch = await api(`/repos/${OWNER}/${repo}/releases?per_page=100&page=${page}`);
    if (!batch?.length) break;
    for (const release of batch) {
      if (release.draft || release.prerelease || !release.published_at) continue;
      if (Date.parse(release.published_at) < since) continue;
      found.push({
        repo,
        tag: release.tag_name,
        url: release.html_url,
        body: release.body || "",
        publishedAt: release.published_at,
        assets: (release.assets || []).map((asset) => ({
          name: asset.name,
          url: asset.browser_download_url,
          size: asset.size,
          contentType: asset.content_type,
        })),
      });
    }
    // The list comes back newest first, so a page whose oldest entry is already
    // outside the window means every later page is too. Checked on the page
    // rather than on the entry: a release created before another and published
    // after it would end the walk one release early.
    const oldest = batch[batch.length - 1];
    if (batch.length < 100 || (oldest?.published_at && Date.parse(oldest.published_at) < since)) break;
  }
  return found.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

/** Up to four screenshots attached to the release, in name order. */
export function promoImages(release, limit = 4) {
  return (release.assets || [])
    .filter((asset) => PROMO_IMAGE.test(asset.name))
    .sort((a, b) => a.name.localeCompare(b.name, "en"))
    .slice(0, limit);
}

/** The hand-written post text attached to the release, if there is one. */
export function promoTextAsset(release) {
  return (release.assets || []).find((asset) => PROMO_TEXT.test(asset.name)) || null;
}

export async function download(url) {
  const response = await fetch(url, { headers: { ...headers(), accept: "application/octet-stream" } });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

export { PROMO_PREFIX };
