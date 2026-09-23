/**
 * The page's clipboard, for the browser surfaces; the desktop copies through its backend instead.
 *
 * `navigator.clipboard` is missing on plain-http pages and can be refused by a page's permissions
 * policy, so a hidden textarea and `execCommand('copy')` — still honoured during a key press —
 * back it up.
 */
export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Fall through to the textarea.
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  const copied = document.execCommand('copy');
  area.remove();
  if (!copied) throw new Error('This page does not allow copying — try another tab');
}
