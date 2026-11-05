import { registerStructuralMerger } from '@kaihuman/core';
import { structuralMergers } from '@kaihuman/formats';

// Core cannot import the formats package, so the app hands it the list-format merges.
for (const [suffix, merge] of Object.entries(structuralMergers)) {
  registerStructuralMerger(suffix, merge);
}
