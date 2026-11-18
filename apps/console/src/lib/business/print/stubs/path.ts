// Minimal POSIX path: only what narro imports (basename, dirname, resolve, isAbsolute, relative, join, extname).
export const isAbsolute = (p: string) => p.startsWith('/');
const normalize = (p: string) => {
  const out: string[] = [];
  for (const s of p.split('/')) {
    if (s === '..') out.pop();
    else if (s && s !== '.') out.push(s);
  }
  return `/${out.join('/')}`;
};
export const resolve = (...parts: string[]) => {
  let acc = '';
  for (const p of parts) acc = isAbsolute(p) ? p : `${acc}/${p}`;
  return normalize(acc);
};
export const join = (...parts: string[]) => normalize(parts.join('/'));
export const dirname = (p: string) => p.slice(0, p.lastIndexOf('/')) || '/';
export const basename = (p: string) => p.slice(p.lastIndexOf('/') + 1);
export const extname = (p: string) => {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i) : '';
};
export const relative = (_from: string, to: string) => to;
