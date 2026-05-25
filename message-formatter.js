/**
 * message-formatter.js — Issue #73
 *
 * Konvertiert DB-Nachrichten (mit content_type-Feld) in das OpenAI Responses API Input-Array.
 */

/**
 * Baut das input-Array für oai.responses.create() aus der SQLite-History.
 * Inkl. task_image-Einträge (Aufgabenbilder).
 *
 * @param {Array<{role: string, content: string, content_type?: string}>} messages
 * @returns {Array}
 */
export function buildInput(messages) {
  return messages.map(m => {
    const ct = m.content_type || 'text';

    if (ct === 'image' || ct === 'task_image') {
      if (m.content.startsWith('data:')) {
        return { role: m.role, content: [{ type: 'input_image', image_url: m.content }] };
      }
      // Marker [image:file-xxx] oder [pdf:file-xxx]
      const match = m.content.match(/^\[(?:image|pdf):([^\]]+)\]$/);
      if (match) {
        return { role: m.role, content: [{ type: 'input_image', file_id: match[1] }] };
      }
    }

    if (ct === 'pdf') {
      const match = m.content.match(/^\[pdf:([^\]]+)\]$/);
      if (match) {
        return { role: m.role, content: [{ type: 'input_file', file_id: match[1] }] };
      }
    }

    // Default: Plaintext
    return { role: m.role, content: m.content };
  });
}
