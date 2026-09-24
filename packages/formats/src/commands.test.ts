import { describe, expect, it } from 'vitest';
import { addCommand, commandParameters, fillCommand, parseCommands } from './commands.js';

describe('parseCommands', () => {
  it('takes the first code block as the command, or the whole text without one', () => {
    const md =
      '# Commands\n\n## List a folder #files\nWith hidden files.\n```sh\nls -la {{folder}}\n```\n\n## Wi-Fi on #network\n\nnmcli radio wifi on\n\n## Empty\n';
    expect(parseCommands(md)).toEqual([
      {
        title: 'List a folder',
        tags: ['files'],
        command: 'ls -la {{folder}}',
        note: 'With hidden files.',
      },
      { title: 'Wi-Fi on', tags: ['network'], command: 'nmcli radio wifi on', note: '' },
    ]);
  });
});

describe('parameters', () => {
  it('names each {{name}} once, leaves every $ to the shell and fills values in as typed', () => {
    const command = "awk '{print $1}' {{file}} | head -{{count}} > {{file}}.top";
    expect(commandParameters(command)).toEqual(['file', 'count']);
    expect(commandParameters('sudo kill -9 `sudo lsof -t -i:\\$1`')).toEqual([]);
    expect(fillCommand(command, { file: 'f.txt', count: '5' })).toBe(
      "awk '{print $1}' f.txt | head -5 > f.txt.top",
    );
    expect(fillCommand(command, { file: 'f.txt' })).toContain('head -{{count}}');
  });
});

describe('addCommand', () => {
  it('appends the command in a sh block and keeps the file readable by the parser', () => {
    const next = addCommand('# Commands\n\n## Up\n\nuptime\n', 'List #files', ['shell'], 'ls $1');
    expect(next.startsWith('# Commands\n')).toBe(true);
    expect(parseCommands(next)).toEqual([
      { title: 'Up', tags: [], command: 'uptime', note: '' },
      { title: 'List', tags: ['shell', 'files'], command: 'ls $1', note: '' },
    ]);
    expect(next).toContain('## List #shell #files\n\n```sh\nls $1\n```');
  });

  it('puts a note above the command', () => {
    const next = addCommand('', 'Pull', [], 'git pull', 'In the repo you are in.');
    expect(parseCommands(next)[0]).toMatchObject({
      command: 'git pull',
      note: 'In the repo you are in.',
    });
  });
});
