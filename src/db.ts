import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// ─── Schema ───────────────────────────────────────────────────────────────────
export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pesetas (
      guild_id  TEXT NOT NULL,
      user_id   TEXT NOT NULL,
      balance   INTEGER NOT NULL DEFAULT 1000,
      PRIMARY KEY (guild_id, user_id)
    )
  `);
  console.log("[DB] Schema ready.");
}

// ─── Queries ──────────────────────────────────────────────────────────────────

// Returns the balance for a user, creating the row with 1000 pesetas if it doesn't exist
export async function getBalance(guildId: string, userId: string): Promise<number> {
  await pool.query(
    `INSERT INTO pesetas (guild_id, user_id, balance)
     VALUES ($1, $2, 1000)
     ON CONFLICT (guild_id, user_id) DO NOTHING`,
    [guildId, userId]
  );
  const result = await pool.query<{ balance: number }>(
    `SELECT balance FROM pesetas WHERE guild_id = $1 AND user_id = $2`,
    [guildId, userId]
  );
  return result.rows[0].balance;
}

// Adds (or subtracts) pesetas from a user. Creates the row if missing.
export async function addPesetas(
  guildId: string,
  userId: string,
  amount: number
): Promise<number> {
  const result = await pool.query<{ balance: number }>(
    `INSERT INTO pesetas (guild_id, user_id, balance)
     VALUES ($1, $2, GREATEST(0, 1000 + $3))
     ON CONFLICT (guild_id, user_id)
     DO UPDATE SET balance = GREATEST(0, pesetas.balance + $3)
     RETURNING balance`,
    [guildId, userId, amount]
  );
  return result.rows[0].balance;
}

// Transfers pesetas from one user to another atomically
export async function transferPesetas(
  guildId: string,
  fromUserId: string,
  toUserId: string,
  amount: number
): Promise<{ fromBalance: number; toBalance: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Ensure both rows exist
    await client.query(
      `INSERT INTO pesetas (guild_id, user_id, balance) VALUES ($1, $2, 1000), ($1, $3, 1000)
       ON CONFLICT DO NOTHING`,
      [guildId, fromUserId, toUserId]
    );

    const fromResult = await client.query<{ balance: number }>(
      `UPDATE pesetas SET balance = balance - $3
       WHERE guild_id = $1 AND user_id = $2
       RETURNING balance`,
      [guildId, fromUserId, amount]
    );

    const toResult = await client.query<{ balance: number }>(
      `UPDATE pesetas SET balance = balance + $3
       WHERE guild_id = $1 AND user_id = $2
       RETURNING balance`,
      [guildId, toUserId, amount]
    );

    await client.query("COMMIT");
    return {
      fromBalance: fromResult.rows[0].balance,
      toBalance: toResult.rows[0].balance,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Returns leaderboard rows for a guild (top 10)
export async function getLeaderboard(
  guildId: string
): Promise<{ user_id: string; balance: number }[]> {
  const result = await pool.query<{ user_id: string; balance: number }>(
    `SELECT user_id, balance FROM pesetas
     WHERE guild_id = $1
     ORDER BY balance DESC
     LIMIT 10`,
    [guildId]
  );
  return result.rows;
}

// Returns the single user with the highest balance in a guild, or null if no rows
export async function getTopUser(
  guildId: string
): Promise<{ user_id: string; balance: number } | null> {
  const result = await pool.query<{ user_id: string; balance: number }>(
    `SELECT user_id, balance FROM pesetas
     WHERE guild_id = $1
     ORDER BY balance DESC
     LIMIT 1`,
    [guildId]
  );
  return result.rows[0] ?? null;
}
