/** Order and names must match `ScanSuggestionEntity` kinds in targets/ios-app-intents/VisualIntelligenceIntents.swift. */
export const SCAN_KINDS = ['budget', 'travel', 'todo', 'consumption'] as const;
export type ScanKind = (typeof SCAN_KINDS)[number];
export const isScanKind = (v: unknown): v is ScanKind => SCAN_KINDS.includes(v as ScanKind);
