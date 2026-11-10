import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SHARED_APP_SOURCES } from '../../plugins/with-kaihuman-widgets.js';
import { SMART_CAPTURE_QUEUE_FILE } from './queue.js';

// There is no Swift compiler in CI, so the native sources are checked as text.
const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (p: string): string => readFileSync(join(root, p), 'utf8');

const MODULE = 'modules/kaihuman-intelligence';
const swift = read(`${MODULE}/ios/KaihumanIntelligenceModule.swift`);
const contract = read(`${MODULE}/index.ts`);
const visual = read('targets/ios-app-intents/VisualIntelligenceIntents.swift');
const smart = read('targets/ios-widget/SmartCaptureModel.swift');
const capture = read('targets/ios-widget/CaptureTodoIntent.swift');
const KINDS = ['budget', 'travel', 'todo', 'consumption'];

describe('kaihuman-intelligence native module', () => {
  it('is registered and named consistently', () => {
    const config = JSON.parse(read(`${MODULE}/expo-module.config.json`));
    expect(config.apple.modules).toEqual(['KaihumanIntelligenceModule']);
    expect(read(`${MODULE}/ios/KaihumanIntelligence.podspec`)).toContain(
      "s.name           = 'KaihumanIntelligence'",
    );
    expect(swift).toContain('Name("KaihumanIntelligence")');
  });

  it('implements every function of the TS contract', () => {
    const iface = contract.slice(
      contract.indexOf('interface KaihumanIntelligenceModule'),
      contract.indexOf('/** Null where'),
    );
    const names = [...iface.matchAll(/^\s{2}(\w+)\(/gm)].map((m) => m[1]);
    expect(names).toEqual(['availability', 'generateText', 'generateJson', 'recognizeDocument']);
    for (const n of names) expect(swift).toMatch(new RegExp(`(Async)?Function\\("${n}"\\)`));
  });

  it('returns every availability status the contract documents', () => {
    const doc = contract.match(/`available`, or why not: ([^*]+)\*/)?.[1] ?? '';
    const statuses = [...doc.matchAll(/`([a-z-]+)`/g)].map((m) => m[1]);
    expect(statuses).toHaveLength(5);
    for (const s of ['available', ...statuses]) expect(swift).toContain(`"${s}"`);
  });

  it('gates iOS 26 APIs and keeps the pre-26 OCR fallback', () => {
    for (const s of [
      'canImport(FoundationModels)',
      '@available(iOS 26.0, *)',
      'DynamicGenerationSchema',
      'RecognizeDocumentsRequest',
      'VNRecognizeTextRequest',
      'VNDocumentCameraViewController',
    ])
      expect(swift).toContain(s);
  });
});

describe('Visual Intelligence intents', () => {
  it('declares the query, open intent and scan link', () => {
    for (const s of [
      'IntentValueQuery',
      'SemanticContentDescriptor',
      'OpenIntent',
      '"pending-url"',
      'canImport(VisualIntelligence)',
      'components.host = "scan"',
      'kaihuman',
    ])
      expect(visual).toContain(s);
    for (const k of KINDS) expect(visual).toContain(`"${k}"`);
  });
});

describe('smart capture', () => {
  it('shares the queue file name with TS', () => {
    expect(smart).toContain(`"${SMART_CAPTURE_QUEUE_FILE}"`);
  });

  it('is generable with the JSON field names and kinds', () => {
    expect(smart).toContain('@Generable');
    for (const k of ['todo', 'log', 'budget', 'habit']) expect(smart).toContain(`"${k}"`);
    const body = smart.slice(smart.indexOf('struct ParsedCapture'), smart.indexOf('var capture:'));
    const fields = [...body.matchAll(/^\s+var (\w+):/gm)].map((m) => m[1]);
    expect(fields).toEqual(['kind', 'text', 'tags', 'due', 'amount', 'category']);
  });

  it('is wired into CaptureTodoIntent and compiled with it', () => {
    expect(capture).toContain('SmartCaptureParser');
    expect(capture).toContain('SmartCaptureQueue');
    expect(SHARED_APP_SOURCES).toContain('SmartCaptureModel.swift');
    expect(SHARED_APP_SOURCES).toContain('CaptureTodoIntent.swift');
  });
});
