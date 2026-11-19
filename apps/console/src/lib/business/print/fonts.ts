// Browser font CSS: woff2 URLs emitted by Vite (not base64) so the bundle stays small.
// Aliases @narro-font-{inter,serif,plex} come from narro.vite.ts.
const SUBSETS = {
  latin:
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext':
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
} as const;

const urls = {
  Inter: import.meta.glob(
    '@narro-font-inter/files/inter-{latin,latin-ext}-{400,600}-normal.woff2',
    { query: '?url', import: 'default', eager: true },
  ),
  'Source Serif 4': import.meta.glob(
    '@narro-font-serif/files/source-serif-4-{latin,latin-ext}-{400,600}-normal.woff2',
    { query: '?url', import: 'default', eager: true },
  ),
  'IBM Plex Sans': import.meta.glob(
    '@narro-font-plex/files/ibm-plex-sans-{latin,latin-ext}-{400,600}-normal.woff2',
    { query: '?url', import: 'default', eager: true },
  ),
} as Record<string, Record<string, string>>;

/** @font-face CSS for an iframe srcdoc (absolute URLs, since srcdoc has no useful base). */
export function browserFontCss(font: string, origin = location.origin): string {
  const files = urls[font] ?? {};
  return Object.entries(files)
    .map(([file, url]) => {
      const m = /-(latin(?:-ext)?)-(\d+)-normal\.woff2$/.exec(file);
      if (!m) return '';
      const [, subset, weight] = m as unknown as [string, keyof typeof SUBSETS, string];
      return `@font-face { font-family: '${font}'; font-style: normal; font-weight: ${weight}; font-display: block; src: url(${origin}${url}) format('woff2'); unicode-range: ${SUBSETS[subset]}; }`;
    })
    .join('\n');
}
