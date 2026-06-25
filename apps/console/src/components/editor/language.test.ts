import { describe, expect, it } from 'vitest';
import { languageForPath } from './language';

describe('languageForPath', () => {
  it('maps markdown extensions to the markdown grammar', () => {
    expect(languageForPath('notes.md')).toBe('markdown');
    expect(languageForPath('README.markdown')).toBe('markdown');
    expect(languageForPath('UPPER.MD')).toBe('markdown');
  });

  it('maps code extensions to their registered grammar name (not short aliases)', () => {
    expect(languageForPath('a.ts')).toBe('typescript');
    expect(languageForPath('a.tsx')).toBe('typescript');
    expect(languageForPath('a.js')).toBe('javascript');
    expect(languageForPath('data.json')).toBe('json');
    expect(languageForPath('styles.css')).toBe('css');
    expect(languageForPath('page.html')).toBe('html');
    expect(languageForPath('run.sh')).toBe('bash');
  });

  it('defaults unknown, extension-less, and missing paths to markdown', () => {
    expect(languageForPath('weird.xyz')).toBe('markdown');
    expect(languageForPath('noextension')).toBe('markdown');
    expect(languageForPath(undefined)).toBe('markdown');
    expect(languageForPath(null)).toBe('markdown');
  });
});
