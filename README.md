# TorrenteBot

Viva el fary

![torrente](https://fotografias.larazon.es/clipping/cmsimages02/2019/08/22/2F8D8810-5220-49C2-8A8C-2D06229F8D49/69.jpg?crop=668,376,x0,y65&width=1280&height=720&optimize=low&format=jpg)

## Commands

| Command | What it does |
|---|---|
| `!torrente` | Replies with a random Fary quote |
| `@TorrenteBot` | Same as above (mention the bot) |
| `!torrente saluda` | Joins your voice channel, plays `greeting.mp3`, then leaves |

## Requirements

- Node.js 20+
- A Discord bot token ([Discord Developer Portal](https://discord.com/developers/applications))
- **Message Content Intent** enabled in the Developer Portal under `Bot → Privileged Gateway Intents`
- `ffmpeg` installed on the system (included in Docker image)
- Bot permissions: `Send Messages`, `Read Message History`, `View Channels`, `Connect`, `Speak`

## Adding audio files

Place `.mp3` files in `assets/audio/`. Currently used:

- `greeting.mp3` — played by `!torrente saluda`

To add new audio: drop the file in `assets/audio/`, commit, and redeploy.

## Local development

```bash
# Install dependencies
npm install

# Install ffmpeg (Ubuntu/Debian)
sudo apt install ffmpeg

# Copy the env example and fill in your token
cp .env.example .env

# Run in dev mode
npm run dev
```

## Deploy (Coolify / Docker)

```bash
docker build -t torrentebot .
docker run -e DISCORD_TOKEN=your_token_here torrentebot
```

For Coolify:
1. Push this repo to GitHub/GitLab
2. New Resource → Application → From Git
3. Coolify auto-detects the `Dockerfile`
4. Add `DISCORD_TOKEN` in the environment variables section
5. Deploy — no port configuration needed

## Project structure

```
src/
└── index.ts            # Bot entry point
assets/
└── audio/
    └── greeting.mp3    # Voice greeting audio
```
