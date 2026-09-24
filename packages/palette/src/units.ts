/**
 * Metric ⇄ US customary: `5 km`, `180 cm`, `5'11"`, `10 lb`, `350 °F`, `2 cups`, `60 mph` —
 * into the other system, or into one unit named after `to` / `in` (`5 km in ft`).
 */
import type { ModeItem } from './command-palette.js';

type Dimension = 'length' | 'mass' | 'volume' | 'area' | 'speed' | 'temperature';
type System = 'metric' | 'us';

interface Unit {
  /** What the result shows. */
  symbol: string;
  dimension: Dimension;
  system: System;
  /** How many of the dimension's base unit (m, g, ml, m², m/s) one of it is. */
  factor: number;
  /** What it converts into when no unit is named: the other system's closest units. */
  to: string[];
  /** Written as, lowercase and without spaces — plurals included. */
  names: string[];
}

const UNITS: Unit[] = [
  {
    symbol: 'mm',
    to: ['in'],
    dimension: 'length',
    system: 'metric',
    factor: 0.001,
    names: ['mm', 'millimeter', 'millimeters', 'millimetre', 'millimetres'],
  },
  {
    symbol: 'cm',
    to: ['in'],
    dimension: 'length',
    system: 'metric',
    factor: 0.01,
    names: ['cm', 'centimeter', 'centimeters', 'centimetre', 'centimetres'],
  },
  {
    symbol: 'm',
    to: ['ft', 'yd'],
    dimension: 'length',
    system: 'metric',
    factor: 1,
    names: ['m', 'meter', 'meters', 'metre', 'metres'],
  },
  {
    symbol: 'km',
    to: ['mi'],
    dimension: 'length',
    system: 'metric',
    factor: 1000,
    names: ['km', 'kilometer', 'kilometers', 'kilometre', 'kilometres'],
  },
  {
    symbol: 'in',
    to: ['cm'],
    dimension: 'length',
    system: 'us',
    factor: 0.0254,
    names: ['in', 'inch', 'inches', '"', '″'],
  },
  {
    symbol: 'ft',
    to: ['m'],
    dimension: 'length',
    system: 'us',
    factor: 0.3048,
    names: ['ft', 'foot', 'feet', "'", '′'],
  },
  {
    symbol: 'yd',
    to: ['m'],
    dimension: 'length',
    system: 'us',
    factor: 0.9144,
    names: ['yd', 'yard', 'yards'],
  },
  {
    symbol: 'mi',
    to: ['km'],
    dimension: 'length',
    system: 'us',
    factor: 1609.344,
    names: ['mi', 'mile', 'miles'],
  },

  {
    symbol: 'mg',
    to: ['oz'],
    dimension: 'mass',
    system: 'metric',
    factor: 0.001,
    names: ['mg', 'milligram', 'milligrams'],
  },
  {
    symbol: 'g',
    to: ['oz'],
    dimension: 'mass',
    system: 'metric',
    factor: 1,
    names: ['g', 'gram', 'grams', 'gramme', 'grammes'],
  },
  {
    symbol: 'kg',
    to: ['lb'],
    dimension: 'mass',
    system: 'metric',
    factor: 1000,
    names: ['kg', 'kilo', 'kilos', 'kilogram', 'kilograms'],
  },
  {
    symbol: 'oz',
    to: ['g'],
    dimension: 'mass',
    system: 'us',
    factor: 28.349523125,
    names: ['oz', 'ounce', 'ounces'],
  },
  {
    symbol: 'lb',
    to: ['kg'],
    dimension: 'mass',
    system: 'us',
    factor: 453.59237,
    names: ['lb', 'lbs', 'pound', 'pounds'],
  },

  {
    symbol: 'ml',
    to: ['fl oz', 'tsp'],
    dimension: 'volume',
    system: 'metric',
    factor: 1,
    names: ['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'],
  },
  {
    symbol: 'cl',
    to: ['fl oz'],
    dimension: 'volume',
    system: 'metric',
    factor: 10,
    names: ['cl', 'centiliter', 'centiliters'],
  },
  {
    symbol: 'dl',
    to: ['cup', 'fl oz'],
    dimension: 'volume',
    system: 'metric',
    factor: 100,
    names: ['dl', 'deciliter', 'deciliters'],
  },
  {
    symbol: 'l',
    to: ['qt', 'gal'],
    dimension: 'volume',
    system: 'metric',
    factor: 1000,
    names: ['l', 'liter', 'liters', 'litre', 'litres'],
  },
  {
    symbol: 'tsp',
    to: ['ml'],
    dimension: 'volume',
    system: 'us',
    factor: 4.92892159375,
    names: ['tsp', 'teaspoon', 'teaspoons'],
  },
  {
    symbol: 'tbsp',
    to: ['ml'],
    dimension: 'volume',
    system: 'us',
    factor: 14.78676478125,
    names: ['tbsp', 'tablespoon', 'tablespoons'],
  },
  {
    symbol: 'fl oz',
    to: ['ml'],
    dimension: 'volume',
    system: 'us',
    factor: 29.5735295625,
    names: ['floz', 'fluidounce', 'fluidounces'],
  },
  {
    symbol: 'cup',
    to: ['ml'],
    dimension: 'volume',
    system: 'us',
    factor: 236.5882365,
    names: ['cup', 'cups'],
  },
  {
    symbol: 'pt',
    to: ['ml', 'l'],
    dimension: 'volume',
    system: 'us',
    factor: 473.176473,
    names: ['pt', 'pint', 'pints'],
  },
  {
    symbol: 'qt',
    to: ['l'],
    dimension: 'volume',
    system: 'us',
    factor: 946.352946,
    names: ['qt', 'quart', 'quarts'],
  },
  {
    symbol: 'gal',
    to: ['l'],
    dimension: 'volume',
    system: 'us',
    factor: 3785.411784,
    names: ['gal', 'gallon', 'gallons'],
  },

  {
    symbol: 'cm²',
    to: ['in²'],
    dimension: 'area',
    system: 'metric',
    factor: 1e-4,
    names: ['cm²', 'cm2', 'sqcm'],
  },
  {
    symbol: 'm²',
    to: ['ft²'],
    dimension: 'area',
    system: 'metric',
    factor: 1,
    names: ['m²', 'm2', 'sqm', 'qm'],
  },
  {
    symbol: 'ha',
    to: ['acres'],
    dimension: 'area',
    system: 'metric',
    factor: 1e4,
    names: ['ha', 'hectare', 'hectares'],
  },
  {
    symbol: 'km²',
    to: ['mi²'],
    dimension: 'area',
    system: 'metric',
    factor: 1e6,
    names: ['km²', 'km2', 'sqkm'],
  },
  {
    symbol: 'in²',
    to: ['cm²'],
    dimension: 'area',
    system: 'us',
    factor: 0.00064516,
    names: ['in²', 'in2', 'sqin'],
  },
  {
    symbol: 'ft²',
    to: ['m²'],
    dimension: 'area',
    system: 'us',
    factor: 0.09290304,
    names: ['ft²', 'ft2', 'sqft'],
  },
  {
    symbol: 'yd²',
    to: ['m²'],
    dimension: 'area',
    system: 'us',
    factor: 0.83612736,
    names: ['yd²', 'yd2', 'sqyd'],
  },
  {
    symbol: 'acres',
    to: ['m²', 'ha'],
    dimension: 'area',
    system: 'us',
    factor: 4046.8564224,
    names: ['acre', 'acres', 'ac'],
  },
  {
    symbol: 'mi²',
    to: ['km²'],
    dimension: 'area',
    system: 'us',
    factor: 2589988.110336,
    names: ['mi²', 'mi2', 'sqmi'],
  },

  {
    symbol: 'm/s',
    to: ['mph'],
    dimension: 'speed',
    system: 'metric',
    factor: 1,
    names: ['m/s', 'mps'],
  },
  {
    symbol: 'km/h',
    to: ['mph'],
    dimension: 'speed',
    system: 'metric',
    factor: 1 / 3.6,
    names: ['km/h', 'kmh', 'kph', 'kmph'],
  },
  {
    symbol: 'mph',
    to: ['km/h'],
    dimension: 'speed',
    system: 'us',
    factor: 0.44704,
    names: ['mph', 'mi/h'],
  },

  // Temperatures are not a factor apart; `celsius` below converts them. The factor is unused.
  {
    symbol: '°C',
    to: ['°F'],
    dimension: 'temperature',
    system: 'metric',
    factor: 1,
    names: ['°c', 'c', 'celsius', 'degc'],
  },
  {
    symbol: 'K',
    to: ['°C', '°F'],
    dimension: 'temperature',
    system: 'metric',
    factor: 1,
    names: ['kelvin', '°k'],
  },
  {
    symbol: '°F',
    to: ['°C'],
    dimension: 'temperature',
    system: 'us',
    factor: 1,
    names: ['°f', 'f', 'fahrenheit', 'degf'],
  },
];

const BY_NAME = new Map(UNITS.flatMap((unit) => unit.names.map((name) => [name, unit] as const)));

const unitNamed = (text: string) => BY_NAME.get(text.toLowerCase().replace(/[\s.]+/g, ''));

/** The temperature in °C, and back. */
const toCelsius = (value: number, unit: Unit) =>
  unit.symbol === '°F' ? ((value - 32) * 5) / 9 : unit.symbol === 'K' ? value - 273.15 : value;
const fromCelsius = (celsius: number, unit: Unit) =>
  unit.symbol === '°F' ? (celsius * 9) / 5 + 32 : unit.symbol === 'K' ? celsius + 273.15 : celsius;

const convert = (value: number, from: Unit, to: Unit) =>
  from.dimension === 'temperature'
    ? fromCelsius(toCelsius(value, from), to)
    : (value * from.factor) / to.factor;

/** Five significant digits, never in exponent form: `3.1069`, `16404`. */
const formatted = (value: number) =>
  Number(value.toPrecision(5)).toLocaleString('en-US', {
    maximumFractionDigits: 20,
    useGrouping: false,
  });

/** `5 ft 10.9 in`, for a length shown as a height. */
const feetAndInches = (meters: number) => {
  const inches = meters / 0.0254;
  let feet = Math.floor(inches / 12);
  let rest = Math.round((inches - feet * 12) * 10) / 10;
  if (rest >= 12) {
    feet += 1;
    rest -= 12;
  }
  return `${feet} ft ${rest} in`;
};

const NUMBER = String.raw`(-?\d+(?:[.,]\d+)?)`;
const QUANTITY = new RegExp(
  String.raw`^${NUMBER}\s*(.+?)(?:\s+(?:to|in|as|into|=|→)\s+(.+))?$`,
  'i',
);
const FEET_INCHES = /^(\d+)\s*(?:ft|feet|foot|'|′)\s*(\d+(?:[.,]\d+)?)\s*(?:in|inch|inches|"|″)?$/i;

const amount = (text: string) => Number(text.replace(',', '.'));

const result = (value: number, unit: Unit, asked: string): ModeItem => {
  const shown = `${formatted(value)} ${unit.symbol}`;
  return { id: `unit:${unit.symbol}`, title: shown, subtitle: asked, copy: shown };
};

/** `5 km` in miles and yards, `5 km in ft` in feet alone, `5'11"` in cm and m. */
export const unitItems = (text: string): ModeItem[] => {
  const height = FEET_INCHES.exec(text);
  if (height) {
    const meters = (amount(height[1] ?? '') * 12 + amount(height[2] ?? '')) * 0.0254;
    const metric = UNITS.filter((unit) => unit.symbol === 'cm' || unit.symbol === 'm');
    return metric.map((unit) => result(meters / unit.factor, unit, `${text} in ${unit.symbol}`));
  }
  const match = QUANTITY.exec(text);
  if (!match) return [];
  const from = unitNamed(match[2] ?? '');
  if (!from) return [];
  const value = amount(match[1] ?? '');
  if (match[3] !== undefined) {
    const to = unitNamed(match[3]);
    if (!to || to.dimension !== from.dimension || to === from) return [];
    return [result(convert(value, from, to), to, text)];
  }
  const counterparts = UNITS.filter((unit) => from.to.includes(unit.symbol));
  const items = counterparts.map((to) =>
    result(convert(value, from, to), to, `${text} in ${to.symbol}`),
  );
  // Between 1 and 10 feet a length is usually a height, told in feet and inches.
  const meters = value * from.factor;
  if (
    from.dimension === 'length' &&
    from.system === 'metric' &&
    meters >= 0.3048 &&
    meters < 3.048
  ) {
    const shown = feetAndInches(meters);
    items.push({
      id: 'unit:ft-in',
      title: shown,
      subtitle: `${text} in feet and inches`,
      copy: shown,
    });
  }
  return items;
};
