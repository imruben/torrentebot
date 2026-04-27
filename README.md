# TorrenteBot

A Discord bot for the Torrente server. Built with discord.js + TypeScript, deployable via Docker.

## Current features

- Responds when **mentioned** (`@TorrenteBot`) or when a message starts with `!torrente`
- Replies with a random Fary quote
- Ignores messages from other bots

## Requirements

- Node.js 20+
- A Discord bot token ([Discord Developer Portal](https://discord.com/developers/applications))
- **Message Content Intent** enabled in the Developer Portal under `Bot → Privileged Gateway Intents`

## Local development

```bash
# Install dependencies
npm install

# Copy the env example and fill in your token
cp .env.example .env

# Run in dev mode (ts-node, no build needed)
npm run dev
```

## Adding the bot to a server

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → your application → **OAuth2 → URL Generator**
2. Scopes: `bot`
3. Bot permissions: `Send Messages`, `Read Message History`, `View Channels`
4. Open the generated URL and invite the bot to your server

The bot works from local as long as the process is running. For permanent availability, deploy it to a VPS.

## Deploy (Coolify / Docker)

```bash
# Build the image
docker build -t torrentebot .

# Run with your token
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
└── index.ts       # Bot entry point: client setup, event listeners, responses
```

## Planned / easy to add next

- Slash commands (`/torrente`) via `discord.js` interaction handlers
- Separate command modules (`src/commands/`)
- Separate event modules (`src/events/`)
- Persistent state with a database (e.g. SQLite, Postgres)
