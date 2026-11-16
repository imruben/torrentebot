// Everything that talks to yt-dlp lives here: common args, cookies, song
// resolution with fallbacks, and keeping the yt-dlp binary up to date.
import { execFile } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { promisify } from "util";
import { getKv, setKv } from "./db";

const execFileAsync = promisify(execFile);

export const COOKIES_PATH = process.env.YTDLP_COOKIES_PATH ?? "/app/data/cookies.txt";
const COOKIES_KV_KEY = "ytdlp_cookies";
const RESOLVE_TIMEOUT_MS = 45_000;
// SoundCloud serves 30s previews for most label tracks — anything this short is not the real song
const MIN_FALLBACK_DURATION_S = 60;

export type SongSource = "youtube" | "soundcloud" | "other";

export interface ResolvedSong {
  title: string;
  url: string;
  source: SongSource;
  // true when YouTube refused and we had to find the song somewhere else
  fallback: boolean;
}

// Thrown when YouTube refuses to serve us (bot check / expired cookies) and no fallback was found
export class YoutubeBlockedError extends Error {
  constructor() {
    super("YouTube blocked the request and no fallback source was found");
    this.name = "YoutubeBlockedError";
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function isYoutubeUrl(url: string): boolean {
  return /^https?:\/\/([\w-]+\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(url);
}

function isUrl(text: string): boolean {
  return /^https?:\/\//i.test(text);
}

export function hasCookies(): boolean {
  return existsSync(COOKIES_PATH);
}

// True when yt-dlp's output says YouTube wants a login / thinks we are a bot
export function isBlockedError(output: string): boolean {
  return /sign in to confirm|not a bot|login_required|cookies are no longer valid|sign in to confirm your age|please sign in/i.test(output);
}

function errorOutput(err: unknown): string {
  const e = err as { stderr?: string; message?: string };
  return `${e?.stderr ?? ""}\n${e?.message ?? ""}`;
}

// Args shared by every yt-dlp call. We deliberately do NOT force a player
// client: yt-dlp's defaults track whatever currently works on YouTube.
export function commonArgs(opts: { cookies?: boolean } = {}): string[] {
  const args = [
    "--no-playlist",
    "--js-runtimes", "node",
    "--remote-components", "ejs:github",
  ];
  const extractorArgs = process.env.YTDLP_EXTRACTOR_ARGS;
  if (extractorArgs) args.push("--extractor-args", extractorArgs);
  if (process.env.YTDLP_PROXY) args.push("--proxy", process.env.YTDLP_PROXY);
  if ((opts.cookies ?? true) && hasCookies()) args.push("--cookies", COOKIES_PATH);
  return args;
}

async function printTitleAndUrl(target: string, cookies: boolean): Promise<{ title: string; url: string }> {
  const args = [
    "--print", "title",
    "--print", "webpage_url",
    "--skip-download",
    // Ask for the format we will actually play so a "no audio available" problem shows up here
    "-f", "bestaudio/best",
    ...commonArgs({ cookies }),
    target,
  ];
  const { stdout } = await execFileAsync("yt-dlp", args, { timeout: RESOLVE_TIMEOUT_MS });
  const lines = stdout.trim().split("\n");
  if (lines.length < 2) throw new Error("yt-dlp returned unexpected output");
  return { title: lines[0].trim(), url: lines[1].trim() };
}

// Video title without touching the player endpoint (works even when YouTube blocks playback)
async function youtubeTitleFromOembed(url: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string };
    return data.title ?? null;
  } catch {
    return null;
  }
}

// "Artist - Song (Official Video) [4K]" → "Artist - Song"
function cleanTitleForSearch(title: string): string {
  return title
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\b(official|video|oficial|videoclip|lyrics?|letra|audio|hd|4k)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── SoundCloud fallback ──────────────────────────────────────────────────────
// Best effort: returns the first full-length, playable SoundCloud result.
export async function findOnSoundCloud(text: string): Promise<{ title: string; url: string } | null> {
  const query = cleanTitleForSearch(text) || text;
  const args = [
    "--ignore-errors",
    "--no-warnings",
    "--skip-download",
    "--match-filter", `duration>${MIN_FALLBACK_DURATION_S}`,
    "--max-downloads", "1",
    "--print", "%(title)s\t%(webpage_url)s",
    `scsearch8:${query}`,
  ];

  let stdout = "";
  try {
    ({ stdout } = await execFileAsync("yt-dlp", args, { timeout: RESOLVE_TIMEOUT_MS }));
  } catch (err) {
    // yt-dlp exits non-zero when --max-downloads is hit or some results were DRM — stdout is still valid
    stdout = (err as { stdout?: string }).stdout ?? "";
  }

  const line = stdout.split("\n").find((l) => l.includes("\thttp"));
  if (!line) return null;
  const [title, url] = line.split("\t");
  return { title: title.trim(), url: url.trim() };
}

// ─── Resolve a query or URL into something playable ───────────────────────────
// Order: YouTube with cookies → YouTube without cookies → SoundCloud.
export async function resolveSong(query: string): Promise<ResolvedSong> {
  const queryIsUrl = isUrl(query);

  if (queryIsUrl && !isYoutubeUrl(query)) {
    const info = await printTitleAndUrl(query, true);
    return { ...info, source: /soundcloud\.com/i.test(info.url) ? "soundcloud" : "other", fallback: false };
  }

  const target = queryIsUrl ? query : `ytsearch1:${query}`;

  let lastError: unknown;
  // Stale cookies can be worse than no cookies at all, so try both ways
  const attempts = hasCookies() ? [true, false] : [false];
  for (const cookies of attempts) {
    try {
      const info = await printTitleAndUrl(target, cookies);
      return { ...info, source: "youtube", fallback: false };
    } catch (err) {
      lastError = err;
      console.error(`[Music] YouTube resolve failed (cookies=${cookies}):`, errorOutput(err).trim().slice(0, 400));
      if (!isBlockedError(errorOutput(err))) break;
    }
  }

  if (!isBlockedError(errorOutput(lastError))) throw lastError;

  const searchText = queryIsUrl ? await youtubeTitleFromOembed(query) : query;
  const alt = searchText ? await findOnSoundCloud(searchText) : null;
  if (alt) {
    console.log(`[Music] YouTube blocked — falling back to SoundCloud: ${alt.url}`);
    return { ...alt, source: "soundcloud", fallback: true };
  }

  throw new YoutubeBlockedError();
}

// ─── Cookies ──────────────────────────────────────────────────────────────────
export function looksLikeCookiesFile(content: string): boolean {
  if (/^# (Netscape )?HTTP Cookie File/m.test(content)) return true;
  // Some exporters drop the header: accept if there is a tab-separated youtube/google cookie line
  return /^\.?(youtube|google)\.com\t(TRUE|FALSE)\t/im.test(content);
}

let lastSyncedCookies: string | null = null;

// Writes cookies to disk (where yt-dlp reads them) and to the DB (so they survive redeploys)
export async function saveCookies(content: string): Promise<void> {
  mkdirSync(path.dirname(COOKIES_PATH), { recursive: true });
  writeFileSync(COOKIES_PATH, content, { mode: 0o600 });
  await setKv(COOKIES_KV_KEY, content);
  lastSyncedCookies = content;
}

// On startup: if the cookies file is gone (fresh container without a volume), restore it from the DB
export async function restoreCookies(): Promise<void> {
  try {
    if (hasCookies()) {
      console.log(`[Music] Using cookies file at ${COOKIES_PATH}`);
      return;
    }
    const stored = await getKv(COOKIES_KV_KEY);
    if (!stored) {
      console.log("[Music] No YouTube cookies configured (upload them with /cookies if YouTube blocks the bot)");
      return;
    }
    mkdirSync(path.dirname(COOKIES_PATH), { recursive: true });
    writeFileSync(COOKIES_PATH, stored, { mode: 0o600 });
    lastSyncedCookies = stored;
    console.log("[Music] Restored YouTube cookies from the database");
  } catch (err) {
    console.error("[Music] Failed to restore cookies:", err);
  }
}

// yt-dlp rewrites the cookie file as YouTube rotates the session. Persist those
// updates so a redeploy does not go back to an older (possibly dead) session.
export function startCookieSync(): void {
  setInterval(async () => {
    try {
      if (!hasCookies()) return;
      const current = readFileSync(COOKIES_PATH, "utf8");
      if (current === lastSyncedCookies || !looksLikeCookiesFile(current)) return;
      await setKv(COOKIES_KV_KEY, current);
      lastSyncedCookies = current;
    } catch (err) {
      console.error("[Music] Cookie sync failed:", err);
    }
  }, 30 * 60_000).unref();
}

// Checks whether YouTube lets us play a video right now
export async function testYoutubeAccess(): Promise<{ ok: boolean; detail: string }> {
  try {
    // "Me at the zoo" — the first YouTube video, as stable a test target as it gets
    const info = await printTitleAndUrl("https://www.youtube.com/watch?v=jNQXAC9IVRw", true);
    return { ok: true, detail: info.title };
  } catch (err) {
    const out = errorOutput(err);
    const errorLine = out.split("\n").find((l) => l.startsWith("ERROR")) ?? out.trim().split("\n").pop() ?? "";
    // Drop yt-dlp's long "Use --cookies… see wiki" tail
    return { ok: false, detail: errorLine.split(" Use --cookies")[0].slice(0, 300) };
  }
}

// ─── Keep yt-dlp fresh ────────────────────────────────────────────────────────
// YouTube breaks old yt-dlp versions every few weeks. The image bakes in whatever
// was current at build time, so update on boot and once a day (production only).
async function updateYtDlp(): Promise<void> {
  try {
    await execFileAsync(
      "pip3",
      ["install", "--quiet", "--break-system-packages", "--upgrade", "yt-dlp[default]"],
      { timeout: 5 * 60_000 }
    );
    const { stdout } = await execFileAsync("yt-dlp", ["--version"]);
    console.log(`[Music] yt-dlp version: ${stdout.trim()}`);
  } catch (err) {
    console.error("[Music] yt-dlp auto-update failed:", errorOutput(err).trim().slice(0, 300));
  }
}

export function startYtDlpAutoUpdate(): void {
  if (process.env.NODE_ENV !== "production" || process.env.YTDLP_AUTO_UPDATE === "0") return;
  void updateYtDlp();
  setInterval(() => void updateYtDlp(), 24 * 60 * 60_000).unref();
}
