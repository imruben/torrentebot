# AGENTS.md

## Commands

```bash
npm run dev      # Run with ts-node (no build needed, requires .env)
npm run build    # Compile TypeScript → dist/
npm start        # Run compiled output (requires build first)
```

No linter or test suite is configured. The only verification step is `npm run build`.

## Required environment variables

Both must be set or the process exits immediately at startup:

```
DISCORD_TOKEN=        # Bot token from Discord Developer Portal (Bot section, not Client ID)
DATABASE_URL=         # PostgreSQL connection string e.g. postgresql://user:pass@host:5432/torrentebot
```

Copy `.env.example` → `.env` for local dev.

## Architecture

```
src/
├── index.ts               # Entry point: command router + event wiring
├── db.ts                  # PostgreSQL pool, schema init, query helpers
├── commands/
│   ├── help.ts            # !torrente → interactive select menu (discord.js components)
│   ├── saluda.ts          # !torrente saluda → joins voice, plays greeting.mp3, leaves
│   ├── pesetas.ts         # !torrente pesetas → show balance
│   ├── ranking.ts         # !torrente ranking → top 10 leaderboard
│   └── apostar.ts         # !torrente apostar / acepto → betting system
└── events/
    └── voiceTracker.ts    # VoiceStateUpdate + 60s interval → award pesetas
assets/audio/              # MP3 files baked into Docker image at build time
```

- `src/index.ts` wires everything. New commands go in `src/commands/`, new events in `src/events/`, then import and add a branch in the `MessageCreate` handler.
- The command router matches on `content.startsWith(PREFIX + " " + subcommand)`. Commands are matched in order — add new ones before the final `else` (which shows the help menu).
- `db.ts` auto-creates the `pesetas` table on startup via `initDb()`. No migration tool — schema changes must be done manually against the DB.

## Key behaviours to know

- **Pesetas** are credited every 60 seconds via `setInterval` in `voiceTracker.ts`, not on leave. Checking balance mid-session reflects real-time earnings only after each tick.
- Voice earnings require **≥ 2 non-bot humans** in the same channel at tick time.
- On bot startup, `startVoiceTicker` scans all guild voice channels via `client.once("ready")` and resumes sessions for users already in voice.
- Bet state (`pendingBets`) is in-memory only — a bot restart cancels all pending bets.
- `!torrente` or `@mention` with no subcommand → shows the help select menu (ephemeral per-command detail, 60s timeout).

## Discord Developer Portal requirements

- **Message Content Intent** must be enabled: `Bot → Privileged Gateway Intents`
- Bot permissions needed: `Send Messages`, `Read Message History`, `View Channels`, `Connect`, `Speak`

## Audio files

- Place `.mp3` files in `assets/audio/`
- `greeting.mp3` is the only one currently used (by `!torrente saluda`)
- Files are copied into the Docker image via `COPY assets ./assets` in the production stage — add files, commit, redeploy

## Docker

The `Dockerfile` is multistage:
1. **builder** (`node:20-alpine`) — installs all deps, compiles TypeScript
2. **runner** (`node:20-alpine`) — prod deps only + `ffmpeg` + compiled `dist/` + `assets/`

`ffmpeg` and native build tools (`python3`, `make`, `g++`) are installed in both stages because `sodium-native` and `@discordjs/opus` require compilation.

No exposed port — the bot is a long-running process, not a web server. Coolify must not require a health-check port.
