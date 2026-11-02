import { formatMinor } from '@kaihuman/formats/business';

/** `1001.38 EUR`; amounts stay integer minor units until this point. */
export const money = (minor: number, currency: string): string =>
  `${formatMinor(minor, currency)} ${currency}`;

export const hours = (minutes: number): string => (minutes / 60).toFixed(1);
