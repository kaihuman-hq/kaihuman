// Maps a file path to a Cascivo editor grammar name. The names must match the
// grammars Cascivo registers (markdown/json/javascript/typescript/css/html/bash/
// plaintext) — short aliases like "ts"/"js" silently fall back to plaintext.
// Unknown/extension-less files default to markdown: this app is markdown-centric
// (wiki, notes, dumps), so it's the most useful default.
const EXTENSION_LANGUAGE: Record<string, string> = {
  md: 'markdown',
  markdown: 'markdown',
  json: 'json',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  css: 'css',
  html: 'html',
  htm: 'html',
  sh: 'bash',
  bash: 'bash',
};

export const languageForPath = (path?: string | null): string => {
  const ext = path?.split('.').pop()?.toLowerCase();
  return (ext && EXTENSION_LANGUAGE[ext]) || 'markdown';
};
