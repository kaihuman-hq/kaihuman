import type { StepType } from '@kaihuman/formats';
import { BedDouble, Car, FileText, KeyRound, Plane, TrainFront } from 'lucide-preact';

// The labels and field lists are shared with the mobile app, so they live in formats.
export { money, STEP_FIELDS, STEP_LABEL, STEP_TYPES, type StepField } from '@kaihuman/formats';

export const STEP_ICON = {
  general: FileText,
  car: Car,
  rental: KeyRound,
  flight: Plane,
  train: TrainFront,
  hotel: BedDouble,
} satisfies Record<StepType, unknown>;
