/**
 * Hands the token to a program waiting on this machine — the CLI or the desktop palette — which
 * opened `/auth/cli?port=…&state=…` in the browser.
 *
 * It goes as a form POST rather than a redirect with the token in the query: a redirect's URL,
 * token and all, stays in the browser's history, while a POST's body does not.
 */
export interface CliCallback {
  port: string;
  token: string;
  state: string;
  repo: string;
}

/** Only a real port: the value comes from the URL, and ends up in the form's action. */
export function isCallbackPort(port: string): boolean {
  if (!/^\d{1,5}$/.test(port)) return false;
  const value = Number(port);
  return value >= 1 && value <= 65535;
}

export function submitCliCallback(doc: Document, { port, token, state, repo }: CliCallback): void {
  if (!isCallbackPort(port)) throw new Error(`Invalid port ${port}`);
  const form = doc.createElement('form');
  form.method = 'POST';
  form.action = `http://localhost:${port}/callback`;
  form.style.display = 'none';
  for (const [name, value] of Object.entries({ token, state, repo })) {
    const input = doc.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.append(input);
  }
  doc.body.append(form);
  form.submit();
}
