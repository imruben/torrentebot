// SuppressNotifications flag (bit 12 = 4096) — makes the bot's messages silent (@silent).
// Applied to reply() and send() calls so nobody hears a notification sound.
// TypeScript's discord.js types don't expose this flag on all overloads,
// so we use a numeric cast to apply it universally.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SILENT = { flags: [1 << 12] as any };
