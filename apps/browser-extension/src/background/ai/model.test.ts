import { afterEach, describe, expect, it, vi } from 'vitest';
import { availability, detectLanguage, promptJson, summarize, translate } from './model';

/** A stand-in for Chrome's `LanguageModel`; `answer` is what every prompt resolves to. */
const fakeModel = (answer: string | Promise<string>, state = 'available') => {
  const prompts: { input: string; options?: { responseConstraint?: object } }[] = [];
  const destroyed: number[] = [];
  const created: object[] = [];
  const model = {
    availability: vi.fn(async () => state),
    create: vi.fn(async (options: object = {}) => {
      created.push(options);
      return {
        prompt: (input: string, options?: { responseConstraint?: object }) => {
          prompts.push({ input, options });
          return Promise.resolve(answer);
        },
        destroy: () => destroyed.push(1),
      };
    }),
  };
  vi.stubGlobal('LanguageModel', model);
  return { model, prompts, destroyed, created };
};

const schema = { type: 'object', properties: { pick: { type: 'string', enum: ['a', 'b'] } } };
const validate = (raw: unknown) => {
  const pick = (raw as { pick?: unknown } | null)?.pick;
  return pick === 'a' || pick === 'b' ? { pick } : null;
};
const task = { system: 'Pick one.', input: 'Which?', schema, validate };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('promptJson', () => {
  it('promptJson sends the schema and returns the validated answer', async () => {
    const answer = JSON.stringify({ pick: 'b' });
    const { prompts, created } = fakeModel(answer);
    expect(await promptJson(task)).toEqual(validate(JSON.parse(answer)));
    expect(prompts[0]?.options?.responseConstraint).toEqual(schema);
    expect(prompts[0]?.input).toBe('Which?');
    expect(created[0]).toMatchObject({
      initialPrompts: [{ role: 'system', content: 'Pick one.' }],
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
    });
  });

  it('declares the languages it is given', async () => {
    const { created, model } = fakeModel(JSON.stringify({ pick: 'a' }));
    await promptJson({ ...task, languages: ['en', 'de'] });
    // Availability is asked for the same languages the session declares.
    expect(model.availability).toHaveBeenCalledWith({
      expectedInputs: [{ type: 'text', languages: ['en', 'de'] }],
      expectedOutputs: [{ type: 'text', languages: ['en', 'de'] }],
    });
    expect(created[0]).toMatchObject({
      expectedInputs: [{ type: 'text', languages: ['en', 'de'] }],
    });
  });

  it('promptJson returns null for invalid JSON or a refused answer', async () => {
    fakeModel('not json');
    expect(await promptJson(task)).toBeNull();
    fakeModel(JSON.stringify({ pick: 'c' }));
    expect(await promptJson(task)).toBeNull();
  });

  it('promptJson returns null without calling create when not available', async () => {
    expect(await promptJson(task)).toBeNull();
    const { model } = fakeModel('{}', 'downloading');
    expect(await promptJson(task)).toBeNull();
    expect(model.create).not.toHaveBeenCalled();
  });

  it('returns null when the model throws', async () => {
    const { model } = fakeModel('{}');
    model.create.mockRejectedValueOnce(new Error('out of memory'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await promptJson(task)).toBeNull();
  });

  it('promptJson gives up after timeoutMs', async () => {
    const { destroyed } = fakeModel(new Promise<string>(() => {}));
    const started = Date.now();
    expect(await promptJson({ ...task, timeoutMs: 50 })).toBeNull();
    expect(Date.now() - started).toBeLessThan(100);
    // The hung session is closed and the queue moves on.
    expect(destroyed).toHaveLength(1);
    fakeModel(JSON.stringify({ pick: 'a' }));
    expect(await promptJson(task)).toEqual({ pick: 'a' });
  });

  it('promptJson destroys its session', async () => {
    const { destroyed } = fakeModel(JSON.stringify({ pick: 'a' }));
    await promptJson(task);
    expect(destroyed.length).toBe(1);
  });
});

describe('summarize, translate and detectLanguage', () => {
  it('summarize and translate return null without their globals', async () => {
    expect(await summarize('Some text', { type: 'tldr' })).toBeNull();
    expect(await translate('Hallo', 'de', 'en')).toBeNull();
    expect(await detectLanguage('Hallo')).toBeNull();
    expect(await availability('summarizer')).toBe('unavailable');
    expect(await availability('translator')).toBe('unavailable');
    expect(await availability('detector')).toBe('unavailable');
    expect(await availability('prompt')).toBe('unavailable');
  });

  it('summarizes with the type, length and context it is given', async () => {
    const calls: unknown[] = [];
    const destroyed: number[] = [];
    vi.stubGlobal('Summarizer', {
      availability: async () => 'available',
      create: async (options: object) => {
        calls.push(options);
        return {
          summarize: async (text: string, options?: object) => {
            calls.push([text, options]);
            return ' Short. ';
          },
          destroy: () => destroyed.push(1),
        };
      },
    });
    expect(
      await summarize('Long text', { type: 'key-points', length: 'medium', context: 'A PR' }),
    ).toBe('Short.');
    expect(calls).toEqual([
      { type: 'key-points', length: 'medium', format: 'plain-text' },
      ['Long text', { context: 'A PR' }],
    ]);
    expect(destroyed).toHaveLength(1);
  });

  it('translates when the pair is available', async () => {
    vi.stubGlobal('Translator', {
      availability: async () => 'available',
      create: async (options: { sourceLanguage: string; targetLanguage: string }) => ({
        translate: async (text: string) =>
          `${text} (${options.sourceLanguage}->${options.targetLanguage})`,
        destroy: () => {},
      }),
    });
    expect(await translate('Hallo', 'de', 'en')).toBe('Hallo (de->en)');
    expect(await availability('translator')).toBe('available');
  });

  it('detectLanguage returns the top language', async () => {
    vi.stubGlobal('LanguageDetector', {
      availability: async () => 'available',
      create: async () => ({
        detect: async () => [
          { detectedLanguage: 'de', confidence: 0.9 },
          { detectedLanguage: 'en', confidence: 0.1 },
        ],
        destroy: () => {},
      }),
    });
    expect(await detectLanguage('Guten Morgen, wie geht es dir?')).toBe('de');
  });

  it('detectLanguage with a timeout gives null on a hung detector and frees the queue', async () => {
    vi.stubGlobal('LanguageDetector', {
      availability: async () => 'available',
      create: async () => ({ detect: () => new Promise(() => {}), destroy: () => {} }),
    });
    vi.stubGlobal('LanguageModel', {
      availability: async () => 'available',
      create: async () => ({ prompt: async () => '{"a":1}', destroy: () => {} }),
    });
    expect(await detectLanguage('Hallo', { timeoutMs: 50 })).toBeNull();
    const answer = await promptJson({
      system: 's',
      input: 'i',
      schema: {},
      validate: (raw) => raw as { a: number },
      timeoutMs: 1000,
    });
    expect(answer).toEqual({ a: 1 });
  });

  it('translate with a timeout gives null on a hung translator', async () => {
    vi.stubGlobal('Translator', {
      availability: async () => 'available',
      create: async () => ({ translate: () => new Promise(() => {}), destroy: () => {} }),
    });
    expect(await translate('Hallo', 'de', 'en', { timeoutMs: 50 })).toBeNull();
  });

  it('detectLanguage gives the base of a regional tag, and null for undetermined', async () => {
    let result = [{ detectedLanguage: 'pt-BR', confidence: 0.8 }];
    vi.stubGlobal('LanguageDetector', {
      availability: async () => 'available',
      create: async () => ({ detect: async () => result, destroy: () => {} }),
    });
    expect(await detectLanguage('Olá')).toBe('pt');
    result = [{ detectedLanguage: 'und', confidence: 1 }];
    expect(await detectLanguage('???')).toBeNull();
  });
});

describe('promptJson with images', () => {
  it('declares image input and sends the blob in the multimodal prompt form', async () => {
    const prompts: unknown[] = [];
    const created: any[] = [];
    vi.stubGlobal('LanguageModel', {
      availability: vi.fn(async () => 'available'),
      create: async (options: object) => {
        created.push(options);
        return {
          prompt: async (input: unknown) => {
            prompts.push(input);
            return JSON.stringify({ ok: true });
          },
          destroy: () => {},
        };
      },
    });
    const blob = new Blob(['x'], { type: 'image/png' });
    const result = await promptJson({
      system: 's',
      input: 'Describe',
      images: [blob],
      schema: {},
      validate: (raw) => (raw as { ok?: boolean }).ok ?? null,
    });
    expect(result).toBe(true);
    expect(created[0].expectedInputs).toContainEqual({ type: 'image' });
    expect(prompts[0]).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', value: 'Describe' },
          { type: 'image', value: blob },
        ],
      },
    ]);
  });
});
