// Posting to X.
//
// Two things happen here and both have a fallback, because X moved its media
// upload onto v2 paths while OAuth 1.0a — the only credential shape that suits
// an unattended job — was reported to be refused there. Asked directly on 25
// August 2026, v2 accepted it and handed back a media id; the forum threads
// saying otherwise are wrong, or were describing something since fixed. The
// v1.1 path stays as the fallback against the day that reverses, and
// `npm run check` re-answers the question rather than trusting this comment.
//
// A failure to attach pictures never cancels the post. A release announcement
// without screenshots is a small loss; a release that goes unannounced because
// an image endpoint changed is the thing this repo exists to prevent.

import crypto from "node:crypto";
import { authHeader } from "./oauth1.mjs";

const POST_URL = "https://api.x.com/2/tweets";
const ME_URL = "https://api.x.com/2/users/me";
const MEDIA_V2 = "https://api.x.com/2/media/upload";
const MEDIA_V1 = "https://upload.twitter.com/1.1/media/upload.json";

/** Straight from the app's own xPost.cjs, and just as true here. */
export const PRICES = { post: 0.015, postWithLink: 0.2 };

const ENV_NAMES = {
  consumerKey: "X_API_KEY",
  consumerSecret: "X_API_SECRET",
  token: "X_ACCESS_TOKEN",
  tokenSecret: "X_ACCESS_SECRET",
};

export function credentialsFromEnv(env = process.env) {
  const credentials = Object.fromEntries(
    Object.entries(ENV_NAMES).map(([field, name]) => [field, env[name]]),
  );
  // Named as they are set, not as they are used: "consumerKey is missing" sends
  // somebody looking for a variable that does not exist anywhere.
  const missing = Object.entries(credentials)
    .filter(([, value]) => !value)
    .map(([field]) => ENV_NAMES[field]);
  return { credentials, missing };
}

function sign(credentials, { method, url, query = {} }) {
  return authHeader({ method, url, query, ...credentials });
}

async function readError(response) {
  const text = await response.text();
  try {
    const payload = JSON.parse(text);
    const summary = payload.detail || payload.title || payload.error || "";
    const specifics = (payload.errors || [])
      .map((entry) => entry?.message || entry?.detail || "")
      .filter(Boolean);
    return [summary, ...specifics].filter(Boolean).join(" — ") || text.slice(0, 300);
  } catch {
    return text.slice(0, 300);
  }
}

/** Whose account the credentials belong to. The first thing `check` asks. */
export async function whoAmI(credentials) {
  const response = await fetch(ME_URL, {
    headers: { authorization: sign(credentials, { method: "GET", url: ME_URL }) },
  });
  if (!response.ok) throw new Error(`Who am I: ${response.status} — ${await readError(response)}`);
  const payload = await response.json();
  return payload.data;
}

/** A multipart body, built by hand so this stays dependency-free. */
function multipart(fields) {
  const boundary = `----valerie${crypto.randomBytes(12).toString("hex")}`;
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    const isFile = Buffer.isBuffer(value?.data);
    parts.push(Buffer.from(`--${boundary}\r\n`));
    if (isFile) {
      parts.push(
        Buffer.from(
          `content-disposition: form-data; name="${name}"; filename="${value.filename}"\r\n` +
            `content-type: ${value.type || "application/octet-stream"}\r\n\r\n`,
        ),
        value.data,
        Buffer.from("\r\n"),
      );
    } else {
      parts.push(Buffer.from(`content-disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
    }
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

/**
 * The v1.1 upload: one request, the whole file. Images are small enough that
 * the chunked flow buys nothing, and this is the endpoint OAuth 1.0a has
 * always been able to reach.
 *
 * Note that multipart body fields are not part of an OAuth 1.0a signature —
 * only the query is. Signing them is the classic reason an upload 401s while
 * the same credentials post text fine.
 */
async function uploadV1(credentials, { data, filename, type }) {
  const { body, contentType } = multipart({
    media_category: "tweet_image",
    media: { data, filename, type },
  });
  const response = await fetch(MEDIA_V1, {
    method: "POST",
    headers: {
      authorization: sign(credentials, { method: "POST", url: MEDIA_V1 }),
      "content-type": contentType,
    },
    body,
  });
  if (!response.ok) throw new Error(`v1.1 upload ${response.status}: ${await readError(response)}`);
  const payload = await response.json();
  return String(payload.media_id_string || payload.media_id);
}

/**
 * The v2 upload: initialize, append, finalize, as three flat paths. The shape
 * is the one the Crosspost Helper app already sends and knows to be right —
 * no `command` field, a JSON body for the first step only.
 */
async function uploadV2(credentials, { data, filename, type }) {
  const initUrl = `${MEDIA_V2}/initialize`;
  const init = await fetch(initUrl, {
    method: "POST",
    headers: {
      authorization: sign(credentials, { method: "POST", url: initUrl }),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      media_category: "tweet_image",
      media_type: type || "image/png",
      total_bytes: data.length,
    }),
  });
  if (!init.ok) throw new Error(`v2 initialize ${init.status}: ${await readError(init)}`);
  const mediaId = String((await init.json())?.data?.id);

  const appendUrl = `${MEDIA_V2}/${mediaId}/append`;
  const { body, contentType } = multipart({ segment_index: "0", media: { data, filename, type } });
  const append = await fetch(appendUrl, {
    method: "POST",
    headers: {
      authorization: sign(credentials, { method: "POST", url: appendUrl }),
      "content-type": contentType,
    },
    body,
  });
  if (!append.ok) throw new Error(`v2 append ${append.status}: ${await readError(append)}`);

  const finalizeUrl = `${MEDIA_V2}/${mediaId}/finalize`;
  const finalize = await fetch(finalizeUrl, {
    method: "POST",
    headers: { authorization: sign(credentials, { method: "POST", url: finalizeUrl }) },
  });
  if (!finalize.ok) throw new Error(`v2 finalize ${finalize.status}: ${await readError(finalize)}`);
  return mediaId;
}

/**
 * One picture, uploaded by whichever endpoint answers.
 *
 * @returns {Promise<{mediaId: string, via: "v2"|"v1.1"}>}
 */
export async function uploadMedia(credentials, file) {
  try {
    return { mediaId: await uploadV2(credentials, file), via: "v2" };
  } catch (v2Error) {
    try {
      return { mediaId: await uploadV1(credentials, file), via: "v1.1" };
    } catch (v1Error) {
      const error = new Error(`Neither upload endpoint accepted the picture.\n  v2:   ${v2Error.message}\n  v1.1: ${v1Error.message}`);
      error.cause = v2Error;
      throw error;
    }
  }
}

/** The post itself. */
export async function post(credentials, { text, mediaIds = [] }) {
  const body = { text };
  const ids = mediaIds.filter(Boolean).slice(0, 4);
  if (ids.length) body.media = { media_ids: ids };

  const response = await fetch(POST_URL, {
    method: "POST",
    headers: {
      authorization: sign(credentials, { method: "POST", url: POST_URL }),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Post ${response.status}: ${await readError(response)}`);
  return (await response.json()).data;
}

/** What this post will be billed at. A link costs more than thirteen times as much. */
export function priceOf(text) {
  return /https?:\/\/|www\.\S+/i.test(text) ? PRICES.postWithLink : PRICES.post;
}
