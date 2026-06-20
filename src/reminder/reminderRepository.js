import { query } from '../database/postgres.js';

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;

  await query(`
    ALTER TABLE reminders
      ADD COLUMN IF NOT EXISTS user_id TEXT,
      ADD COLUMN IF NOT EXISTS chat_id TEXT,
      ADD COLUMN IF NOT EXISTS source_message_id TEXT,
      ADD COLUMN IF NOT EXISTS remind_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
  `);

  await query(`
    UPDATE reminders
    SET
      user_id = COALESCE(user_id, target_jid),
      chat_id = COALESCE(chat_id, target_jid),
      source_message_id = COALESCE(source_message_id, whatsapp_msg_id),
      remind_at = COALESCE(remind_at, "time"),
      status = COALESCE(status, CASE WHEN is_sent = true THEN 'done' ELSE 'pending' END),
      updated_at = COALESCE(updated_at, created_at, NOW())
  `);

  await query(`
    ALTER TABLE reminders
      ALTER COLUMN user_id SET DEFAULT '',
      ALTER COLUMN chat_id SET DEFAULT '',
      ALTER COLUMN status SET DEFAULT 'pending';
  `);

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_reminders_chat_source_message
    ON reminders(chat_id, source_message_id)
    WHERE source_message_id IS NOT NULL;
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_reminders_user_time
    ON reminders(user_id, remind_at);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_reminders_due
    ON reminders(remind_at)
    WHERE status = 'pending';
  `);

  schemaReady = true;
}

export async function listByRange(userId, startIso, endIso) {
  await ensureSchema();

  const res = await query(
    `
      SELECT
        id,
        user_id,
        chat_id,
        source_message_id,
        message,
        remind_at,
        status,
        created_at,
        updated_at
      FROM reminders
      WHERE user_id = $1
        AND status = 'pending'
        AND remind_at >= $2
        AND remind_at <= $3
      ORDER BY remind_at ASC
    `,
    [userId, startIso, endIso]
  );

  return res.rows;
}

export async function createOrUpdateReminder({
  userId,
  chatId,
  sourceMessageId,
  message,
  remindAt
}) {
  await ensureSchema();

  if (sourceMessageId) {
    const res = await query(
      `
        INSERT INTO reminders (
          id,
          user_id,
          chat_id,
          source_message_id,
          message,
          remind_at,
          status,
          created_at,
          updated_at,
          target_jid,
          "time",
          is_sent,
          whatsapp_msg_id
        )
        VALUES (
          CONCAT(EXTRACT(EPOCH FROM NOW())::bigint::text, '-', SUBSTRING(MD5(RANDOM()::text), 1, 6)),
          $1, $2, $3, $4, $5, 'pending', NOW(), NOW(),
          $2, $5, false, $3
        )
        ON CONFLICT (chat_id, source_message_id)
        DO UPDATE SET
          user_id = EXCLUDED.user_id,
          message = EXCLUDED.message,
          remind_at = EXCLUDED.remind_at,
          status = 'pending',
          updated_at = NOW(),
          target_jid = EXCLUDED.target_jid,
          "time" = EXCLUDED."time",
          is_sent = false,
          whatsapp_msg_id = EXCLUDED.whatsapp_msg_id
        RETURNING
          id,
          user_id,
          chat_id,
          source_message_id,
          message,
          remind_at,
          status,
          created_at,
          updated_at
      `,
      [userId, chatId, sourceMessageId, message, remindAt]
    );

    return res.rows[0];
  }

  const res = await query(
    `
      INSERT INTO reminders (
        id,
        user_id,
        chat_id,
        source_message_id,
        message,
        remind_at,
        status,
        created_at,
        updated_at,
        target_jid,
        "time",
        is_sent,
        whatsapp_msg_id
      )
      VALUES (
        CONCAT(EXTRACT(EPOCH FROM NOW())::bigint::text, '-', SUBSTRING(MD5(RANDOM()::text), 1, 6)),
        $1, $2, NULL, $3, $4, 'pending', NOW(), NOW(),
        $2, $4, false, NULL
      )
      RETURNING
        id,
        user_id,
        chat_id,
        source_message_id,
        message,
        remind_at,
        status,
        created_at,
        updated_at
    `,
    [userId, chatId, message, remindAt]
  );

  return res.rows[0];
}

export async function deleteAllForUser(userId) {
  await ensureSchema();

  const res = await query(
    `DELETE FROM reminders WHERE user_id = $1 RETURNING id`,
    [userId]
  );

  return res.rowCount;
}

export async function getDueReminders() {
  await ensureSchema();

  const res = await query(
    `
      SELECT
        id,
        user_id,
        chat_id,
        source_message_id,
        message,
        remind_at,
        status
      FROM reminders
      WHERE status = 'pending'
        AND remind_at <= NOW()
      ORDER BY remind_at ASC
    `
  );

  return res.rows;
}

export async function markDone(id) {
  await ensureSchema();

  const res = await query(
    `
      UPDATE reminders
      SET
        status = 'done',
        updated_at = NOW(),
        is_sent = true
      WHERE id = $1
    `,
    [id]
  );

  return res.rowCount > 0;
}