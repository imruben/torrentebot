# TorrenteBot

Viva el fary

![torrente](https://fotografias.larazon.es/clipping/cmsimages02/2019/08/22/2F8D8810-5220-49C2-8A8C-2D06229F8D49/69.jpg?crop=668,376,x0,y65&width=1280&height=720&optimize=low&format=jpg)

## Commands

Slash commands (registered automatically when the bot starts):

| Command | Description |
|---|---|
| `/pon <cancion>` | Play a song (name or URL) or add it to the queue |
| `/cola` `/skip` `/stop` `/pausa` `/sigue` | Queue controls |
| `/autodj` | Toggle Auto-DJ (keeps playing related songs when the queue ends) |
| `/audio <clip>` | Bot joins your voice channel and plays a clip from `assets/audio/` |
| `/pesetas` | Top 10 leaderboard for the server |
| `/apostar [rival] [cantidad]` | Challenge someone to a bet |
| `/ruleta <cantidad>` | Bet pesetas on the roulette |
| `/cookies [archivo]` | Bot owner only — upload YouTube cookies / check that YouTube works |

## Music and YouTube

Music is streamed with `yt-dlp` + `ffmpeg`. The bot updates `yt-dlp` by itself on boot and once a day.

YouTube blocks most server/datacenter IPs with *"Sign in to confirm you're not a bot"*. When that happens the bot:

1. retries without cookies (stale cookies can be worse than none),
2. falls back to **SoundCloud** (best effort: label tracks there are 30s previews or DRM, so you often get a cover/remix),
3. if nothing is found, tells the channel that the cookies need renewing.

To get real YouTube audio back, give the bot cookies from a logged-in session:

1. Open a **private/incognito window** and log into YouTube (a throwaway Google account is recommended — the account can get flagged).
2. In that same tab go to `https://www.youtube.com/robots.txt`.
3. Export the cookies with the [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc) extension (allow it in incognito) → `cookies.txt`.
4. **Close the incognito window** (so the browser never rotates that session).
5. In Discord run `/cookies archivo:<cookies.txt>`. The bot saves it, tests YouTube and tells you if it works.

The cookies are stored in `/app/data/cookies.txt` and in Postgres, so they survive redeploys without any volume. `/cookies` with no file just runs the YouTube check. Only the owner of the Discord application (or IDs in `OWNER_ID`) can use it.

Alternative without cookies: set `YTDLP_PROXY` to a residential proxy.

## Pesetas economy

- Every user starts with **1000 pesetas** on first interaction
- Earn **100 pesetas per minute** spent in a voice channel
- You only earn if there are **at least 2 humans** in the channel
- Bet any amount against other users — no min or max limit
- Bets are 50/50 — winner takes the pesetas from the loser
- Bet challenges expire after **60 seconds** if not accepted

## Audio files

Place `.mp3` files in `assets/audio/`. Currently used:

- `greeting.mp3` — played by `!torrente saluda`

To add new audio: drop the file in `assets/audio/`, commit, and redeploy.

## Requirements

- Node.js 20+
- ffmpeg installed on the system (included in Docker image)
- PostgreSQL database
- Discord bot token — [Discord Developer Portal](https://discord.com/developers/applications)
- **Message Content Intent** enabled under `Bot → Privileged Gateway Intents`
- Bot permissions: `Send Messages`, `Read Message History`, `View Channels`, `Connect`, `Speak`

## Local development

```bash
# Install dependencies
npm install

# Install ffmpeg (Ubuntu/Debian)
sudo apt install ffmpeg

# Copy and fill in environment variables
cp .env.example .env

# Run in dev mode
npm run dev
```

## Deploy (Coolify / Docker)

1. Set up a PostgreSQL service in Coolify
2. Push this repo to GitHub/GitLab
3. New Resource → Application → From Git (Coolify auto-detects the `Dockerfile`)
4. Add environment variables:
   - `DISCORD_TOKEN`
   - `DATABASE_URL` (from the Coolify PostgreSQL service)
5. Deploy — no port configuration needed

## Project structure

```
src/
├── index.ts                  # Entry point, command router, event wiring
├── db.ts                     # Database connection and query helpers
├── commands/
│   ├── saluda.ts             # !torrente saluda — voice greeting
│   ├── pesetas.ts            # !torrente pesetas — show balance
│   ├── ranking.ts            # !torrente ranking — leaderboard
│   └── apostar.ts            # !torrente apostar / acepto — betting
└── events/
    └── voiceTracker.ts       # VoiceStateUpdate — earn pesetas in voice
assets/
└── audio/
    └── greeting.mp3          # Voice greeting audio
```
