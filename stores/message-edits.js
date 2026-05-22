import { getDb } from '../db.js';

/**
 * Speichert einen neuen Edit für eine Nachricht.
 * Alle vorherigen Edits für diese message_id werden als inaktiv markiert.
 * Gibt den neu angelegten Eintrag zurück.
 */
export function saveMessageEdit(messageId, content) {
  const db = getDb();

  const last = db.prepare(
    `SELECT version FROM message_edits WHERE message_id = ? ORDER BY id DESC LIMIT 1`
  ).get(messageId);
  const version = last ? last.version + 1 : 1;

  db.prepare(
    `UPDATE message_edits SET is_active = 0 WHERE message_id = ?`
  ).run(messageId);

  const result = db.prepare(
    `INSERT INTO message_edits (message_id, content, version, is_active) VALUES (?, ?, ?, 1)`
  ).run(messageId, content, version);

  return db.prepare(
    `SELECT * FROM message_edits WHERE id = ?`
  ).get(result.lastInsertRowid);
}

/**
 * Gibt alle Versionen für eine Nachricht zurück, neueste zuerst.
 */
export function getMessageEdits(messageId) {
  return getDb().prepare(
    `SELECT id, message_id, content, version, is_active, created_at
     FROM message_edits WHERE message_id = ?
     ORDER BY id DESC`
  ).all(messageId);
}

/**
 * Gibt den aktiven Edit für eine Nachricht zurück, oder null wenn kein Edit existiert.
 */
export function getActiveEdit(messageId) {
  return getDb().prepare(
    `SELECT id, message_id, content, version, is_active, created_at
     FROM message_edits WHERE message_id = ? AND is_active = 1
     LIMIT 1`
  ).get(messageId) || null;
}

/**
 * Setzt einen bestimmten Edit als aktiv; alle anderen Edits dieser Nachricht werden deaktiviert.
 * Gibt { ok: false, error } zurück wenn editId nicht existiert.
 */
export function setActiveEdit(editId) {
  const db = getDb();

  const edit = db.prepare(`SELECT * FROM message_edits WHERE id = ?`).get(editId);
  if (!edit) return { ok: false, error: 'Edit nicht gefunden' };

  db.prepare(
    `UPDATE message_edits SET is_active = 0 WHERE message_id = ?`
  ).run(edit.message_id);

  db.prepare(
    `UPDATE message_edits SET is_active = 1 WHERE id = ?`
  ).run(editId);

  return { ok: true };
}

/**
 * Löscht einen Edit-Eintrag.
 * Verweigert das Löschen wenn is_active = 1 und noch weitere Versionen für diese Nachricht existieren.
 */
export function deleteMessageEdit(editId) {
  const db = getDb();

  const edit = db.prepare(`SELECT * FROM message_edits WHERE id = ?`).get(editId);
  if (!edit) return { ok: false, error: 'Edit nicht gefunden' };

  if (edit.is_active === 1) {
    const otherCount = db.prepare(
      `SELECT COUNT(*) AS cnt FROM message_edits WHERE message_id = ? AND id != ?`
    ).get(edit.message_id, editId);
    if (otherCount.cnt > 0) {
      return { ok: false, error: 'Aktive Version kann nicht gelöscht werden solange andere Versionen existieren' };
    }
  }

  db.prepare(`DELETE FROM message_edits WHERE id = ?`).run(editId);
  return { ok: true };
}
