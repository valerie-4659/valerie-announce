# valerie-announce

Posts a release announcement to [@valeries_apps](https://x.com/valeries_apps) and to Discord when any Valerie app publishes one.

One job for every app, not one per repository. It finds the apps by itself: every public repository on the account that has ever published a release is one, which means a new app is covered the day it ships its first version and nothing has to be added here.

That applies to both channels. Discord used to be each project's own business — a webhook secret, a `notify-discord.cjs` and a documented step per repository — which meant a new app announced nothing there until somebody remembered all three, and Crosspost Helper shipped v1.25.0 to a channel that never heard about it because the secret had never been set. One webhook lives here now instead.

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

## The other channel

Discord gets the same release with more room. X charges $0.20 for a post with a link and refuses it at 281 weighted characters, so three short bullets ride at most; a webhook costs nothing, renders an embed and allows 4096, so nothing is dropped and the screenshot goes inline.

```
Crosspost Helper v1.25.0

✨ Who follows whom is kept now, shown on each person's card and used when tagging
✨ The extension can re-read the following for everyone on the list in one go
🐛 A saved QT counts its age from when the post went out, not from when you saved it
🐛 The browser panel stays open until you close it, instead of on every reload
🐛 The following is read on a post page instead of always saying "not checked"
🐛 Description popovers no longer run off the edge of a narrow panel

📥 Download for Windows, macOS and Linux
```

Six bullets where X carried two. What does **not** change is the section rule: a release that is a bare list still contributes no bullets, because length was never the reason for that rule — a list nobody wrote for a reader surfaces the commit log, and it does that on both channels.

A release that carries a `promo-announce.json` asset — a project that had its notes written for it — uses that instead: its headline becomes the embed's title and its sections become the list, because that text was composed for a stranger rather than derived from headings.

The two channels are recorded separately, in `state/posted.json` and `state/posted-discord.json`. A run that reached X and failed Discord has to remember exactly that; one file would mean a Discord outage re-announcing on X the next run, or an X failure silencing Discord for good. It is also what made adding this channel safe: every current release was owed a Discord post and no X post, and the announcer worked that out by itself.

```bash
node src/announce.mjs --dry                    # both channels, composed and printed
node src/announce.mjs --no-x --only artqueue-app   # Discord only
node src/announce.mjs --no-discord              # X only, the way it used to be
```

## The fortnightly recap

A second post, on its own schedule: one per app, every two weeks, saying what shipped since the last one.

```
Crosspost Helper — the last two weeks

✨ Start from the picture
✨ Set a marked stretch of the caption in a Unicode style
🐛 Reading a quoted post from a link keeps the display name

4 releases  https://github.com/valerie-4659/crossposthelper-app/releases
```

One line per release, newest first, taken from the release's lead line — the `**Something** — what it lets you do.` that the projects now write above their sections. A release without one falls back to its first quotable bullet, and one with neither contributes no line while still being counted: "4 releases" and four lines are different claims.

It is deliberately quiet. An app with no release in the window gets no post, and neither does one whose releases say nothing a stranger can read. Most Mondays this posts nothing at all, which is the correct output — a fortnightly "nothing to report" costs $0.20 and teaches people to scroll past the account.

The pictures from the newest release in the window ride along, which is also what stops X drawing its own preview card.

```bash
npm run recap:dry                                   # every due recap, sends nothing
node src/recap.mjs --only crossposthelper-app --dry  # one app, ignoring the cadence gate
npm run recap -- --seed                             # record today as recapped, post nothing
```

The recap goes to both channels, deliberately in the same words: somebody who follows both should see one message twice, not two accounts of the same fortnight. The clock only moves when at least one of them accepted it — a fortnight recorded as recapped after both failed is a fortnight nobody hears about and nothing retries.

`state/recapped.json` holds when each app was last recapped. The schedule runs weekly and the fortnight is a gate in the script, not in the cron expression: cron cannot say "every two weeks" without drifting through the year, and a gate in code means a missed Monday is picked up the next one rather than a month later.

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
npm run say -- --file intro.txt        # a post that is not a release; add --send to send it
```

`--dry` never writes the state file. `--seed` records today's releases as already announced without posting, which is how this repository was initialised.

## Saying something that is not a release

`src/say.mjs` posts a text somebody wrote, and nothing else — the account introducing itself, a note that a download is broken, an answer. It reads no releases and touches no state, so it can never interfere with an announcement.

```bash
node src/say.mjs --file intro.txt                    # prints it, sends nothing
node src/say.mjs --file intro.txt --image one.png --send
```

Sending is opt-in for the same reason `--dry` is the default everywhere else here: the direction that costs money and cannot be undone is not the one you get by forgetting a flag. Up to four `--image`, in the order given. The character count is X's own weighted one, so a post is refused here at 281 rather than by the API at 400.

## Setting it up

1. **`.env`** from `.env.example`. `X_API_KEY` and `X_API_SECRET` come from the existing developer app — the one Crosspost Helper already uses. A developer app can post on behalf of any account that authorises it, so **@valeries_apps needs no developer signup of its own**. That matters: a new signup lands on pay-per-use with no free allowance.
2. The app needs **Read and Write** permission and sign-in enabled, or the authorisation flow has nothing to offer.
3. `npm run authorize`, in a browser logged in as **@valeries_apps** — not the main account. It prints two tokens that do not expire.
4. `npm run check`. It says which account the tokens belong to and which media endpoint answered.
5. Put all four values in this repository's **Actions secrets**, plus `DISCORD_WEBHOOK_URL` — one webhook, one channel, every app. Without it the runs announce on X and say Discord was skipped.
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
