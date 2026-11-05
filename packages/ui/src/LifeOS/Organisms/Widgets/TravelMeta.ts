import type { StepType } from '@kaihuman/formats';
import { BedDouble, Car, FileText, KeyRound, Plane, TrainFront } from 'lucide-preact';

export type StepField = { key: string; label: string; type: 'date' | 'text' };

export const STEP_LABEL: Record<StepType, string> = {
  general: 'General',
  car: 'Car',
  rental: 'Rental',
  flight: 'Flight',
  train: 'Train',
  hotel: 'Hotel',
};
export const STEP_TYPES = Object.keys(STEP_LABEL) as StepType[];
export const STEP_ICON = {
  general: FileText,
  car: Car,
  rental: KeyRound,
  flight: Plane,
  train: TrainFront,
  hotel: BedDouble,
} satisfies Record<StepType, unknown>;

const PLACES: StepField[] = [
  { key: 'from', label: 'From', type: 'text' },
  { key: 'to', label: 'To', type: 'text' },
];
// start/end hold a date or a datetime; plain text keeps both forms editable.
const WHEN: StepField[] = [
  { key: 'start', label: 'Start', type: 'text' },
  { key: 'end', label: 'End', type: 'text' },
];
export const STEP_FIELDS: Record<StepType, StepField[]> = {
  general: [
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'description', label: 'Description', type: 'text' },
  ],
  car: [
    { key: 'tollStart', label: 'Toll from', type: 'date' },
    { key: 'tollEnd', label: 'Toll until', type: 'date' },
    { key: 'tollRef', label: 'Toll ref', type: 'text' },
  ],
  rental: [...PLACES, ...WHEN, { key: 'ref', label: 'Ref', type: 'text' }],
  flight: [...PLACES, ...WHEN, { key: 'ref', label: 'Ref', type: 'text' }],
  train: [...PLACES, ...WHEN, { key: 'ref', label: 'Ref', type: 'text' }],
  hotel: [
    { key: 'from', label: 'Check-in', type: 'date' },
    { key: 'to', label: 'Check-out', type: 'date' },
    { key: 'ref', label: 'Ref', type: 'text' },
  ],
};

export const money = (amount: number, currency: string): string =>
  `${amount.toFixed(2)} ${currency}`;
