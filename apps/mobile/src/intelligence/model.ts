import type {
  KaihumanIntelligenceModule,
  ModelTarget,
} from '../../modules/kaihuman-intelligence/index.js';

export type { ModelTarget };

/** The JSON Schema subset the native side turns into a Foundation Models `DynamicGenerationSchema`. */
export type SchemaField =
  | { type: 'string'; description?: string; enum?: readonly string[] }
  | { type: 'number' | 'integer' | 'boolean'; description?: string }
  | { type: 'array'; description?: string; items: { type: 'string' } };

export interface ObjectSchema {
  type: 'object';
  description?: string;
  properties: Record<string, SchemaField>;
  required: readonly string[];
}

/** What the features need from a model; tests pass a fake, the app passes `nativeModel()`. */
export interface LanguageModel {
  available(target: ModelTarget): boolean;
  text(prompt: string, instructions: string, target: ModelTarget): Promise<string>;
  /** Parsed JSON; callers still validate it, a model can return anything. */
  json(
    prompt: string,
    instructions: string,
    schema: ObjectSchema,
    target: ModelTarget,
  ): Promise<unknown>;
}

/** Wraps the native module (`native.ts` passes the linked one); null where it is not linked. */
export function nativeModel(mod: KaihumanIntelligenceModule | null): LanguageModel | null {
  if (!mod) return null;
  const available = (target: ModelTarget) => {
    try {
      return mod.availability(target) === 'available';
    } catch {
      return false;
    }
  };
  return {
    available,
    text: (prompt, instructions, target) => mod.generateText(prompt, instructions, target),
    json: async (prompt, instructions, schema, target) =>
      JSON.parse(await mod.generateJson(prompt, instructions, JSON.stringify(schema), target)),
  };
}

/** Private Cloud Compute when it is there (bigger context), else on-device, else null. */
export const bestTarget = (model: LanguageModel | null): ModelTarget | null =>
  !model
    ? null
    : model.available('server')
      ? 'server'
      : model.available('device')
        ? 'device'
        : null;
