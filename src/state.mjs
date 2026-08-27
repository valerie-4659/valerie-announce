// What has already been announced.
//
// Keyed by repository, holding the tag last posted. The file is committed by
// the workflow after every run, which is also what keeps the scheduled trigger
// from being switched off for inactivity.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "state", "posted.json");

export async function readState() {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

export async function writeState(state) {
  const sorted = Object.fromEntries(Object.entries(state).sort(([a], [b]) => (a < b ? -1 : 1)));
  await fs.writeFile(FILE, `${JSON.stringify(sorted, null, 2)}\n`);
}

export { FILE as STATE_FILE };

// When each app was last recapped.
//
// A second file rather than a second key: the announcement state is written on
// every run and the recap's every fortnight, and a single file means the run
// that writes one has to not lose the other. Two files cannot interleave.
const RECAP_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "state", "recapped.json");

export async function readRecapState() {
  try {
    return JSON.parse(await fs.readFile(RECAP_FILE, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

export async function writeRecapState(state) {
  const sorted = Object.fromEntries(Object.entries(state).sort(([a], [b]) => (a < b ? -1 : 1)));
  await fs.writeFile(RECAP_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
}

export { RECAP_FILE };

// What has already gone to Discord.
//
// A third file, for the reason the recap has a second one: the two channels
// are posted independently, and a run that got one out and failed the other
// must remember exactly that. Sharing a file would mean a Discord outage
// re-announcing on X the next run, or an X failure silencing Discord for good.
const DISCORD_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "state", "posted-discord.json");

export async function readDiscordState() {
  try {
    return JSON.parse(await fs.readFile(DISCORD_FILE, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

export async function writeDiscordState(state) {
  const sorted = Object.fromEntries(Object.entries(state).sort(([a], [b]) => (a < b ? -1 : 1)));
  await fs.writeFile(DISCORD_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
}

export { DISCORD_FILE };
