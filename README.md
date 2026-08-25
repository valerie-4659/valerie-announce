# valerie-announce

Posts a release announcement to [@valeries_apps](https://x.com/valeries_apps) when any Valerie app publishes one.

One job for every app, not one per repository. It finds the apps by itself: every public repository on the account that has ever published a release is one, which means a new app is covered the day it ships its first version and nothing has to be added here.

## What a post looks like

```
Crosspost Helper v1.19.0

✨ A filmstrip, so a decision can be judged against its neighbours
✨ A 30s cooldown after posting, to rule out a double post
🐛 Move the mark badge down by the buttons, not the top corner

https://github.com/valerie-4659/crossposthelper-app/releases/tag/v1.19.0
```

There are two ways it gets there.

**Written by hand.** A release that carries an asset called `promo-post.txt` uses its contents verbatim, link and all. This is the way to say something that is not a changelog.

**Composed.** Otherwise the release notes are read, and only bullets that stand under a section the composer recognises (`✨ New`, `🐛 Fixed`, `⚡ Faster`, or the words `Added` / `Fixed` / `Changed` / `Improved`) are used, and only while they are short enough to be a headline rather than a sentence. If nothing qualifies, the post is the app, the version and the link — which is the honest answer, and never a clause cut off mid-word.

That rule has teeth. Of the eight apps live today, two publish notes the composer will quote; the other six get the headline form until their release notes grow the headings. `imageworkflowhelper` was one keystroke away from announcing `asarUnpack entries added for /node_modules/sharp/**/*` to the public, which is what the rule is for.

## Screenshots

Any asset on the release whose name starts with `promo-` and ends in `.png`, `.jpg` or `.webp` is attached to the post, up to four, in name order. They are ordinary release assets, uploaded by the project's own release workflow from `docs/promo/<version>/` — see `docs/announcing.md` in any project for the step.

If an upload fails, the post still goes out without pictures. A release that goes unannounced because an image endpoint changed would be the worse outcome.

## What it costs

X has been pay-per-use since 6 February 2026. A post costs $0.015, and **a post containing a link costs $0.200** — more than thirteen times as much. Every announcement carries a download link, so budget roughly `$0.20 × releases`. Eight apps at two releases a month is about $3.20.

The lever, if that ever matters: drop the link, put it in the account bio, and the same post costs $0.015.

## Running it

```bash
npm test                    # the composer, and the OAuth signature
npm run dry                 # compose every pending post, send nothing
node src/announce.mjs --only crossposthelper-app --dry
npm run authorize           # one-off, gets the tokens for @valeries_apps
npm run check               # proves the credentials and the media upload work
```

`--dry` never writes the state file. `--seed` records today's releases as already announced without posting, which is how this repository was initialised.

## Setting it up

1. **`.env`** from `.env.example`. `X_API_KEY` and `X_API_SECRET` come from the existing developer app — the one Crosspost Helper already uses. A developer app can post on behalf of any account that authorises it, so **@valeries_apps needs no developer signup of its own**. That matters: a new signup lands on pay-per-use with no free allowance.
2. The app needs **Read and Write** permission and sign-in enabled, or the authorisation flow has nothing to offer.
3. `npm run authorize`, in a browser logged in as **@valeries_apps** — not the main account. It prints two tokens that do not expire.
4. `npm run check`. It says which account the tokens belong to and which media endpoint answered.
5. Put all four values in this repository's **Actions secrets**.
6. `npm run dry` once more, then let the schedule take it.

## Why OAuth 1.0a and not the flow the app uses

Crosspost Helper signs in with OAuth 2.0 and PKCE, because a person is sitting there. X's OAuth 2.0 refresh tokens rotate on every use, so an unattended job would have to write the new one back into its own repository secret after every run — and a crash between the refresh and that write leaves the bot dead with nothing to notice it. OAuth 1.0a tokens are static. For something that runs on a schedule and nobody watches, that outweighs everything else.

Whether X accepts OAuth 1.0a on its v2 media endpoint was genuinely unclear — the developer forums contradict each other. Asked directly on **25 August 2026**, `/2/media/upload` accepted it and returned a media id. The v1.1 fallback stays in place against the day that changes, but it is not what runs today. `npm run check` re-answers the question whenever it matters.

## Triggers

| | |
|---|---|
| `repository_dispatch` | a project's release workflow pokes this one; the post follows within a minute |
| `schedule`, every 3h | the safety net for projects not wired up, and what keeps GitHub from disabling the schedule after 60 quiet days |
| `workflow_dispatch` | by hand, dry by default |

Guards, all of them there to make an unsendable mistake impossible:

- a release older than 72 hours is recorded, never announced
- at most three posts per run
- drafts and pre-releases are skipped by GitHub's own `releases/latest`
- one run at a time, so two schedules cannot post the same release twice
