/**
 * The coarse kind of client behind a download, the only trace of the User-Agent the worker
 * keeps: email link scanners and previews show up as `bot`, so the console can tell them from
 * a person opening the file.
 */

export type ClientClass = 'browser' | 'bot' | 'other';

// Checked first: most scanners and headless browsers also send `Mozilla/`.
const BOT = /bot|crawler|spider|preview|scanner|curl|wget|python|headless/i;

export function clientClass(ua: string | null): ClientClass {
  if (!ua) return 'other';
  if (BOT.test(ua)) return 'bot';
  return ua.includes('Mozilla/') ? 'browser' : 'other';
}
