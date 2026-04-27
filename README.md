# TorrenteBot

Viva el fary

![torrente](https://fotografias.larazon.es/clipping/cmsimages02/2019/08/22/2F8D8810-5220-49C2-8A8C-2D06229F8D49/69.jpg?crop=668,376,x0,y65&width=1280&height=720&optimize=low&format=jpg)

## Current features
- Responds when **mentioned** (`@TorrenteBot`) or when a message starts with `!torrente`
- Replies with a random Fary quote
- Ignores messages from other bots

## Requirements
- Node.js 20+
- A Discord bot token ([Discord Developer Portal](https://discord.com/developers/applications))

## Local development
```bash
# Install dependencies
npm install

# Copy the env example and fill in your token
cp .env.example .env

# Run in dev mode (ts-node, no build needed)
npm run dev
```
