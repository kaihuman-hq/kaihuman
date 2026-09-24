import { describe, expect, it } from 'vitest';
import { commandParameters, fillCommand, parseCommands } from './commands.js';

describe('parseCommands', () => {
  it('takes the first code block as the command and the rest as its note', () => {
    const file = [
      '# Commands',
      '',
      '## List a folder #files',
      'Shows hidden files too.',
      '```sh',
      'ls -la {{folder}}',
      '```',
      '```sh',
      'not this one',
      '```',
    ].join('\n');
    expect(parseCommands(file)).toEqual([
      {
        title: 'List a folder',
        tags: ['files'],
        command: 'ls -la {{folder}}',
        note: 'Shows hidden files too.\n\n```sh\nnot this one\n```',
      },
    ]);
  });

  it('takes the whole text when there is no code block, and skips empty entries', () => {
    expect(parseCommands('## Wi-Fi on #network\n\nnmcli radio wifi on\n\n## Empty\n')).toEqual([
      { title: 'Wi-Fi on', tags: ['network'], command: 'nmcli radio wifi on', note: '' },
    ]);
  });

  it('keeps a multi-line command whole', () => {
    const [entry] = parseCommands('## Two\n```\ncd {{repo}}\ngit pull\n```');
    expect(entry?.command).toBe('cd {{repo}}\ngit pull');
  });
});

describe('commandParameters', () => {
  it('lists each {{name}} once, in the order they first appear', () => {
    expect(commandParameters('ls {{folder}}')).toEqual(['folder']);
    expect(commandParameters('cp {{from}} {{ to }} && echo {{from}}')).toEqual(['from', 'to']);
  });

  it('leaves every $ to the shell, escaped or not', () => {
    // The command from the bug report: `\$1` used to be read as an escape and never asked for.
    expect(commandParameters('sudo kill -9 `sudo lsof -t -i:\\$1`')).toEqual([]);
    expect(commandParameters("awk '{print $1}' $HOME $0")).toEqual([]);
  });

  it('ignores Go templates, which are not names', () => {
    expect(commandParameters("docker inspect -f '{{.State.Status}}' {{container}}")).toEqual([
      'container',
    ]);
    expect(commandParameters("docker ps --format '{{json .Names}}'")).toEqual([]);
  });
});

describe('fillCommand', () => {
  it('puts the values in as typed, wherever each name is used', () => {
    expect(fillCommand('sudo kill -9 `sudo lsof -t -i:{{port}}`', { port: '3000' })).toBe(
      'sudo kill -9 `sudo lsof -t -i:3000`',
    );
    expect(fillCommand('ls {{folder}}', { folder: '-la /tmp' })).toBe('ls -la /tmp');
    expect(fillCommand('cp {{from}} {{ to }} && echo {{from}}', { from: 'a', to: 'b' })).toBe(
      'cp a b && echo a',
    );
  });

  it('keeps $ as written and a name without a value as its placeholder', () => {
    expect(fillCommand("awk '{print $1}' {{file}}", { file: 'f.txt' })).toBe(
      "awk '{print $1}' f.txt",
    );
    expect(fillCommand('echo {{a}} {{b}}', { a: '' })).toBe('echo  {{b}}');
  });
});
