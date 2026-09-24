import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCallbackPort, submitCliCallback } from './cli-callback';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('isCallbackPort', () => {
  it('accepts port numbers only', () => {
    expect(isCallbackPort('45623')).toBe(true);
    expect(isCallbackPort('1')).toBe(true);
    for (const bad of ['0', '65536', '', '80a', '80/evil', '-1', '123456']) {
      expect(isCallbackPort(bad)).toBe(false);
    }
  });
});

describe('submitCliCallback', () => {
  it('posts the token to the waiting program instead of putting it in a URL', () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
    submitCliCallback(document, { port: '45623', token: 'gho_secret', state: 's1', repo: 'o/r' });

    const form = document.querySelector('form') as HTMLFormElement;
    expect(form.method).toBe('post');
    expect(form.action).toBe('http://localhost:45623/callback');
    expect(form.action).not.toContain('gho_secret');
    expect(Object.fromEntries(new FormData(form))).toEqual({
      token: 'gho_secret',
      state: 's1',
      repo: 'o/r',
    });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('refuses a port that is not a number, without submitting anything', () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
    expect(() =>
      submitCliCallback(document, { port: '80@evil.example', token: 't', state: '', repo: '' }),
    ).toThrow('Invalid port');
    expect(submit).not.toHaveBeenCalled();
    expect(document.querySelector('form')).toBeNull();
  });
});
