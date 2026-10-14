// @vitest-environment node
import { describe, expect, it } from 'vitest';
import manifest from '../manifest';
import { accessPatternOf, DEFAULT_SERVICES } from './background/service-status';

// The store's install warning is built from these: standing access to every site is what turned
// it into "read and change all your data on all websites".
describe('manifest permissions', () => {
  const m = manifest as unknown as {
    host_permissions: string[];
    optional_host_permissions: string[];
    content_scripts: { matches: string[] }[];
    permissions: string[];
    side_panel?: { default_path: string };
    commands: Record<string, { suggested_key?: { default?: string } }>;
  };

  it('asks for no standing access to every site', () => {
    expect(m.host_permissions).not.toContain('<all_urls>');
    expect(m.content_scripts.flatMap((script) => script.matches)).toEqual([
      'https://app.kaihuman.com/*',
    ]);
    expect(m.optional_host_permissions).toEqual(['<all_urls>']);
  });

  it('covers every default status page, so the start page needs no prompt for them', () => {
    for (const service of DEFAULT_SERVICES) {
      expect(m.host_permissions).toContain(accessPatternOf(service));
    }
  });

  it('declares the side panel', () => {
    expect(m.permissions).toContain('sidePanel');
    expect(m.side_panel?.default_path).toBe('sidepanel.html');
  });

  it('binds pin-current-tab', () => {
    expect(m.commands['pin-current-tab']?.suggested_key?.default).toBe('Alt+Shift+P');
  });

  it('adds no host permission for work', () => {
    expect(m.host_permissions).toEqual([
      'https://api.github.com/*',
      'https://api.deepl.com/*',
      'https://api-free.deepl.com/*',
      'https://www.githubstatus.com/*',
      'https://status.claude.com/*',
      'https://www.cloudflarestatus.com/*',
      'https://health.aws.amazon.com/*',
      'https://status.cloud.google.com/*',
    ]);
  });
});
