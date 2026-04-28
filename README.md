# TorrenteBot

Viva el fary

![torrente](https://fotografias.larazon.es/clipping/cmsimages02/2019/08/22/2F8D8810-5220-49C2-8A8C-2D06229F8D49/69.jpg?crop=668,376,x0,y65&width=1280&height=720&optimize=low&format=jpg)

## Commands

| Command | Description |
|---|---|
| `!torrente` | Random Fary quote |
| `@TorrenteBot` | Same as above |
| `!torrente saluda` | Bot joins your voice channel, plays `greeting.mp3`, then leaves |
| `!torrente pesetas` | Shows your current pesetas balance |
| `!torrente ranking` | Shows the top 10 leaderboard for the server |
| `!torrente apostar @user <amount>` | Challenge someone to a bet |
| `!torrente acepto` | Accept a pending bet challenge |

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
