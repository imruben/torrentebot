# ─── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN apk add --no-cache python3 py3-pip make g++ && \
    pip3 install --break-system-packages "yt-dlp[default]"

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ─── Production stage ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache ffmpeg python3 py3-pip make g++ && \
    pip3 install --break-system-packages "yt-dlp[default]"

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY assets ./assets

CMD ["node", "dist/index.js"]
