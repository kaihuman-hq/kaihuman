import { describe, expect, it } from 'vitest';
import { conversionItems, evaluate } from './convert.js';

const values = (query: string, all = false) =>
  conversionItems(query, all).map((item) => item.title);
const groups = (query: string, all = false) => [
  ...new Set(conversionItems(query, all).map((item) => item.group)),
];

describe('colors', () => {
  it('turns a hex color into rgb and hsl', () => {
    expect(values('#ff8800')).toEqual(['rgb(255, 136, 0)', 'hsl(32, 100%, 50%)']);
    expect(values('#f80')).toEqual(['rgb(255, 136, 0)', 'hsl(32, 100%, 50%)']);
  });

  it('turns rgb and hsl into the other two forms', () => {
    expect(values('rgb(255, 136, 0)')).toEqual(['#ff8800', 'hsl(32, 100%, 50%)']);
    expect(values('hsl(120, 100%, 25%)')).toEqual(['#008000', 'rgb(0, 128, 0)']);
    expect(values('hsl(0 0% 100%)')).toEqual(['#ffffff', 'rgb(255, 255, 255)']);
  });

  it('ignores what is not a color', () => {
    expect(values('#ff88')).toEqual([]);
    expect(values('rgb(300, 0, 0)')).toEqual([]);
  });
});

describe('numbers', () => {
  it('converts prefixed numbers into the other bases', () => {
    expect(values('0x1f')).toEqual(['31', '0b11111', '0o37']);
    expect(values('0b101')).toEqual(['5', '0x5', '0o5']);
    expect(values('0o17')).toEqual(['15', '0xf', '0b1111']);
  });

  it('converts a plain integer only when asked for everything', () => {
    expect(values('42')).toEqual([]);
    expect(values('42', true)).toEqual(['0x2a', '0b101010', '0o52']);
  });

  it('keeps large numbers exact', () => {
    expect(values('0xffffffffffffffffff')[0]).toBe('4722366482869645213695');
  });
});

describe('evaluate', () => {
  it('follows precedence, parentheses and powers', () => {
    expect(evaluate('2 + 3 * 4')).toBe(14);
    expect(evaluate('(2 + 3) * 4')).toBe(20);
    expect(evaluate('-2^2')).toBe(-4);
    expect(evaluate('2^3^2')).toBe(512);
    expect(evaluate('7 % 3')).toBe(1);
    expect(evaluate('10 ÷ 4 × 2')).toBe(5);
  });

  it('refuses anything that is not arithmetic', () => {
    expect(evaluate('2 +')).toBeNull();
    expect(evaluate('(1 + 2')).toBeNull();
    expect(evaluate('1 / 0')).toBeNull();
    expect(evaluate('alert(1)')).toBeNull();
  });
});

describe('math', () => {
  it('offers the result of a sum, without float noise', () => {
    expect(values('12*7')).toEqual(['84']);
    expect(values('0.1 + 0.2')).toEqual(['0.3']);
  });

  it('needs an operation, so a lone number or a date is no sum', () => {
    expect(values('-5')).toEqual([]);
    expect(groups('2026-09-24')).toEqual(['Time']);
  });
});

describe('time', () => {
  it('reads 10 digits as seconds and 13 as milliseconds', () => {
    expect(values('1790208000')[0]).toBe('2026-09-24T00:00:00.000Z');
    expect(values('1790208000000')[0]).toBe('2026-09-24T00:00:00.000Z');
  });

  it('turns an ISO date into Unix time', () => {
    expect(values('2026-09-24T00:00:00Z')).toEqual(['1790208000', '1790208000000']);
  });
});

describe('case and Lorem ipsum', () => {
  it('rewrites text in every case, only when asked for everything', () => {
    expect(values('user profile ID')).toEqual([]);
    expect(values('user profileId', true)).toEqual([
      'userProfileId',
      'UserProfileId',
      'user_profile_id',
      'user-profile-id',
      'USER_PROFILE_ID',
      'User Profile Id',
      'User profile id',
      'user profileid',
      'USER PROFILEID',
    ]);
  });

  it('reads acronyms as one word', () => {
    expect(values('parseHTMLString', true)[2]).toBe('parse_html_string');
  });

  it('writes filler text on “lorem”', () => {
    const items = conversionItems('lorem 2', true);
    expect(items.map((item) => item.subtitle)).toEqual([
      'One sentence',
      'One paragraph',
      '2 paragraphs',
    ]);
    expect(items[2]?.copy?.split('\n\n')).toHaveLength(2);
    expect(items[0]?.copy).toMatch(/^Lorem ipsum dolor sit amet/);
  });

  it('copies what it shows', () => {
    for (const item of conversionItems('#ff8800', true)) expect(item.copy).toBe(item.title);
  });
});

describe('units', () => {
  it('converts metric into US customary', () => {
    expect(values('5 km')).toEqual(['3.1069 mi']);
    expect(values('1,5 kg')).toEqual(['3.3069 lb']);
    expect(values('1 l')).toEqual(['1.0567 qt', '0.26417 gal']);
    expect(values('100 m2')).toEqual(['1076.4 ft²']);
    expect(values('100 km/h')).toEqual(['62.137 mph']);
    expect(values('20 °C')).toEqual(['68 °F']);
  });

  it('converts US customary into metric', () => {
    expect(values('10 lb')).toEqual(['4.5359 kg']);
    expect(values('2 cups')).toEqual(['473.18 ml']);
    expect(values('1 acre')).toEqual(['4046.9 m²', '0.40469 ha']);
    expect(values('60 mph')).toEqual(['96.561 km/h']);
    expect(values('350F')).toEqual(['176.67 °C']);
    expect(values('5 in')).toEqual(['12.7 cm']);
  });

  it('tells a height in feet and inches, and reads one', () => {
    expect(values('180 cm')).toEqual(['70.866 in', '5 ft 10.9 in']);
    expect(values('5\'11"')).toEqual(['180.34 cm', '1.8034 m']);
    expect(values('5 ft 11 in')).toEqual(['180.34 cm', '1.8034 m']);
  });

  it('converts into the unit named after to or in, of the same kind only', () => {
    expect(values('5 km in ft')).toEqual(['16404 ft']);
    expect(values('5 in in cm')).toEqual(['12.7 cm']);
    expect(values('3 m to cm')).toEqual(['300 cm']);
    expect(values('10 kg to mi')).toEqual([]);
  });

  it('leaves text that only looks like a quantity alone', () => {
    expect(values('iphone 15')).toEqual([]);
    expect(values('5k')).toEqual([]);
    expect(values('5 in a row')).toEqual([]);
  });

  it('copies the value with its unit', () => {
    const [item] = conversionItems('5 km');
    expect(item).toMatchObject({ copy: '3.1069 mi', subtitle: '5 km in mi', group: 'Units' });
  });
});
