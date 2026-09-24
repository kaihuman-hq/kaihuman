/**
 * Conversions the palette works out itself, without a request: colors, number bases, arithmetic,
 * timestamps and metric ⇄ US units — offered for whatever is typed — and, behind `>k`, letter
 * case and Lorem ipsum too. Choosing one copies it.
 */
import type { ModeItem } from './command-palette.js';
import { unitItems } from './units.js';

type Rgb = [number, number, number];

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB_COLOR = /^rgba?\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*\)$/i;
const HSL_COLOR =
  /^hsla?\(\s*(-?\d+(?:\.\d+)?)(?:deg)?\s*[,\s]\s*(\d+(?:\.\d+)?)%\s*[,\s]\s*(\d+(?:\.\d+)?)%\s*\)$/i;

const hslToRgb = (h: number, s: number, l: number): Rgb => {
  const hue = (((h % 360) + 360) % 360) / 360;
  const sat = Math.min(s, 100) / 100;
  const light = Math.min(l, 100) / 100;
  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
  const p = 2 * light - q;
  const channel = (t: number) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [channel(hue + 1 / 3), channel(hue), channel(hue - 1 / 3)].map((c) =>
    Math.round(c * 255),
  ) as Rgb;
};

const rgbToHsl = ([r, g, b]: Rgb): [number, number, number] => {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [Math.round(h * 60), Math.round(s * 100), Math.round(l * 100)];
};

const parseColor = (text: string): { rgb: Rgb; form: 'hex' | 'rgb' | 'hsl' } | null => {
  const hex = HEX_COLOR.exec(text)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
    const rgb = [0, 2, 4].map((at) => Number.parseInt(full.slice(at, at + 2), 16)) as Rgb;
    return { rgb, form: 'hex' };
  }
  const rgb = RGB_COLOR.exec(text);
  if (rgb) {
    const channels = rgb.slice(1, 4).map(Number) as Rgb;
    return channels.every((c) => c <= 255) ? { rgb: channels, form: 'rgb' } : null;
  }
  const hsl = HSL_COLOR.exec(text);
  if (hsl) return { rgb: hslToRgb(Number(hsl[1]), Number(hsl[2]), Number(hsl[3])), form: 'hsl' };
  return null;
};

const colorItems = (text: string): ModeItem[] => {
  const color = parseColor(text);
  if (!color) return [];
  const { rgb } = color;
  const [h, s, l] = rgbToHsl(rgb);
  const forms = {
    hex: `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`,
    rgb: `rgb(${rgb.join(', ')})`,
    hsl: `hsl(${h}, ${s}%, ${l}%)`,
  };
  return Object.entries(forms)
    .filter(([form]) => form !== color.form)
    .map(([form, value]) => item(`color:${form}`, value, `${form.toUpperCase()} of ${text}`));
};

const BASES = [
  { name: 'Decimal', radix: 10, mark: '' },
  { name: 'Hex', radix: 16, mark: '0x' },
  { name: 'Binary', radix: 2, mark: '0b' },
  { name: 'Octal', radix: 8, mark: '0o' },
] as const;

/**
 * `0x1f`, `0b101` and `0o17` in the other bases; a plain integer only when `decimal` — typed
 * into the main search, a number is more often a web search than a conversion.
 */
const numberItems = (text: string, decimal: boolean): ModeItem[] => {
  const prefixed = /^0([xbo])[0-9a-f]+$/i.exec(text);
  if (!prefixed && !(decimal && /^\d+$/.test(text))) return [];
  let value: bigint;
  try {
    value = BigInt(text.toLowerCase());
  } catch {
    return [];
  }
  const from = prefixed ? `0${prefixed[1]?.toLowerCase()}` : '';
  return BASES.filter((base) => base.mark !== from).map((base) =>
    item(`number:${base.radix}`, `${base.mark}${value.toString(base.radix)}`, base.name),
  );
};

/** `+ - * / % ^` and parentheses over decimal numbers; null for anything else. */
export const evaluate = (expression: string): number | null => {
  const tokens = expression
    .replaceAll('×', '*')
    .replaceAll('÷', '/')
    .match(/\d+(?:\.\d+)?|\.\d+|[-+*/%^()]|\S/g);
  if (!tokens) return null;
  let at = 0;
  const peek = () => tokens[at];
  const next = () => tokens[at++];

  // expr = term (± term)*, term = unary (*|/|% unary)*, unary = -unary | power,
  // power = primary (^ unary)? — so -2^2 is -4 and 2^3^2 is 2^9.
  const expr = (): number => {
    let value = term();
    while (peek() === '+' || peek() === '-')
      value = next() === '+' ? value + term() : value - term();
    return value;
  };
  const term = (): number => {
    let value = unary();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = next();
      const right = unary();
      value = op === '*' ? value * right : op === '/' ? value / right : value % right;
    }
    return value;
  };
  const unary = (): number => {
    if (peek() === '-') {
      next();
      return -unary();
    }
    if (peek() === '+') {
      next();
      return unary();
    }
    return power();
  };
  const power = (): number => {
    const base = primary();
    if (peek() !== '^') return base;
    next();
    return base ** unary();
  };
  const primary = (): number => {
    const token = next();
    if (token === '(') {
      const value = expr();
      if (next() !== ')') throw new Error('unclosed');
      return value;
    }
    if (token === undefined || !/^[\d.]/.test(token)) throw new Error('not a number');
    return Number(token);
  };

  try {
    const value = expr();
    return at === tokens.length && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
};

/** At least one operator between two operands — `12*7`, not `-5` or `(3)`. */
const ARITHMETIC = /^[\d\s.+\-*/%^()×÷]+$/;
const HAS_OPERATION = /[\d.)]\s*[-+*/%^×÷]\s*[-+(.\d]/;

const mathItems = (text: string): ModeItem[] => {
  if (!ARITHMETIC.test(text) || !HAS_OPERATION.test(text) || ISO_DATE.test(text)) return [];
  const value = evaluate(text);
  if (value === null) return [];
  // 12 significant digits hide float noise: 0.1+0.2 is 0.3.
  return [item('math', String(Number(value.toPrecision(12))), `= ${text}`)];
};

const ISO_DATE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/i;

/** 10 digits as seconds or 13 as milliseconds since 1970, or an ISO date as those. */
const timeItems = (text: string): ModeItem[] => {
  if (/^\d{10}$|^\d{13}$/.test(text)) {
    const date = new Date(text.length === 10 ? Number(text) * 1000 : Number(text));
    return [
      item('time:iso', date.toISOString(), 'ISO 8601, UTC'),
      item('time:local', date.toLocaleString(), 'Local time'),
    ];
  }
  if (ISO_DATE.test(text)) {
    const ms = Date.parse(text);
    if (Number.isNaN(ms)) return [];
    return [
      item('time:s', String(Math.floor(ms / 1000)), 'Unix time, seconds'),
      item('time:ms', String(ms), 'Unix time, milliseconds'),
    ];
  }
  return [];
};

/** `fooBar`, `foo_bar`, `Foo bar` → `['foo', 'bar']`. */
const words = (text: string) =>
  text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_\-./]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());

const capitalized = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

const caseItems = (text: string): ModeItem[] => {
  const list = words(text);
  if (!list.length || !/\p{L}/u.test(text)) return [];
  const cases: [string, string][] = [
    ['camelCase', list.map((word, index) => (index ? capitalized(word) : word)).join('')],
    ['PascalCase', list.map(capitalized).join('')],
    ['snake_case', list.join('_')],
    ['kebab-case', list.join('-')],
    ['CONSTANT_CASE', list.join('_').toUpperCase()],
    ['Title Case', list.map(capitalized).join(' ')],
    ['Sentence case', capitalized(list.join(' '))],
    ['lower case', text.toLowerCase()],
    ['UPPER CASE', text.toUpperCase()],
  ];
  return cases.map(([name, value]) => item(`case:${name}`, value, name));
};

const LOREM = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
  'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
  'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
];

const loremParagraph = (index: number) =>
  LOREM.map((_, at) => LOREM[(at + index) % LOREM.length]).join(' ');

/** `lorem` or `lorem 5`: a sentence, a paragraph and that many paragraphs (3 by default). */
const loremItems = (text: string): ModeItem[] => {
  const match = /^lorem(?:\s+(\d{1,2}))?$/i.exec(text);
  if (!match) return [];
  const count = Math.max(1, Number(match[1] ?? 3));
  const paragraphs = Array.from({ length: count }, (_, index) => loremParagraph(index));
  return [
    item('lorem:sentence', LOREM[0] ?? '', 'One sentence'),
    item('lorem:paragraph', loremParagraph(0), 'One paragraph'),
    item('lorem:paragraphs', paragraphs.join('\n\n'), `${count} paragraphs`),
  ];
};

const item = (id: string, value: string, subtitle: string): ModeItem => ({
  id: `convert:${id}`,
  title: value,
  subtitle,
  copy: value,
});

const grouped = (group: string, items: ModeItem[]) => items.map((entry) => ({ ...entry, group }));

/**
 * What the palette converts `text` into, by kind. `all` (for `>k`) adds plain decimal numbers,
 * Lorem ipsum and — for text nothing else reads — letter case, which would crowd the main search.
 */
export const conversionItems = (query: string, all = false): ModeItem[] => {
  const text = query.trim();
  if (!text) return [];
  const read = [
    ...grouped('Color', colorItems(text)),
    ...grouped('Math', mathItems(text)),
    ...grouped('Number', numberItems(text, all)),
    ...grouped('Time', timeItems(text)),
    ...grouped('Units', unitItems(text)),
    ...(all ? grouped('Lorem ipsum', loremItems(text)) : []),
  ];
  return read.length || !all ? read : grouped('Case', caseItems(text));
};
