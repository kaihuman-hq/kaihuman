const pad = (value: number) => String(value).padStart(2, '0');

/** `2026-09-24`: the local calendar day — the widgets all count days in local time. */
export const localDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
