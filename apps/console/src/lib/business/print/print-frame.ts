/** Hidden-iframe print: load full HTML via srcdoc, wait for fonts, call print(), clean up. */
export async function printHtml(html: string): Promise<void> {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  // No scripts: document content (e.g. a `javascript:` link) must never run with the console's origin.
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  await new Promise<void>((resolve) => {
    frame.onload = () => resolve();
    frame.srcdoc = html;
  });
  try {
    const win = frame.contentWindow;
    if (!win) throw new Error('no iframe window');
    await win.document.fonts.ready;
    await new Promise<void>((resolve) => {
      win.addEventListener('afterprint', () => resolve(), { once: true });
      win.focus();
      win.print();
    });
  } finally {
    frame.remove();
  }
}
