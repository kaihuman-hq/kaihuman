import { describe, expect, it } from 'vitest';
import { enqueue } from './queue';

/** A job that records when it starts and finishes only when `finish` is called. */
const gate = (name: string, log: string[]) => {
  let finish: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const run = async () => {
    log.push(name);
    await done;
    return name;
  };
  return { run, finish: () => finish() };
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('enqueue', () => {
  it('runs one job at a time', async () => {
    const log: string[] = [];
    const first = gate('first', log);
    const second = gate('second', log);
    const a = enqueue(first.run, 'background');
    const b = enqueue(second.run, 'background');
    await tick();
    expect(log).toEqual(['first']);
    first.finish();
    expect(await a).toBe('first');
    await tick();
    expect(log).toEqual(['first', 'second']);
    second.finish();
    expect(await b).toBe('second');
  });

  it('interactive jobs jump queued background jobs', async () => {
    const log: string[] = [];
    const bg1 = gate('bg1', log);
    const bg2 = gate('bg2', log);
    const inter = gate('inter', log);
    const all = [
      enqueue(bg1.run, 'background'),
      enqueue(bg2.run, 'background'),
      enqueue(inter.run, 'interactive'),
    ];
    await tick();
    bg1.finish();
    await tick();
    inter.finish();
    await tick();
    bg2.finish();
    await Promise.all(all);
    expect(log).toEqual(['bg1', 'inter', 'bg2']);
  });

  it('keeps going after a job fails', async () => {
    const failed = enqueue(async () => {
      throw new Error('boom');
    }, 'interactive');
    await expect(failed).rejects.toThrow('boom');
    expect(await enqueue(async () => 'next', 'interactive')).toBe('next');
  });
});
