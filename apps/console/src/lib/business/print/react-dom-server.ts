import { render } from 'preact';

// Zero-dependency renderToStaticMarkup for the browser: mount into a detached node and read
// innerHTML. (preact-render-to-string would be the production choice; it is not a dependency yet.)
export function renderToStaticMarkup(vnode: Parameters<typeof render>[0]): string {
  const host = document.createElement('div');
  render(vnode, host);
  const html = host.innerHTML;
  render(null, host);
  return html;
}
