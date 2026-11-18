// Bundle-size entry: what the console would actually ship for this feature.

import { offerData, offerMarkdown } from './fixture';
import { browserFontCss } from './fonts';
import { printHtml } from './print';
import { renderOfferHtml } from './render';
import { renderToStaticMarkup } from './shim-react-dom-server';

export async function demo() {
  const { html } = await renderOfferHtml(
    { data: offerData, markdown: offerMarkdown, fontCss: browserFontCss('Inter') },
    renderToStaticMarkup as (v: unknown) => string,
  );
  await printHtml(html);
}
(globalThis as Record<string, unknown>).__narroDemo = demo;
