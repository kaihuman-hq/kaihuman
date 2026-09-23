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
      'ls -la $1',
      '```',
      '```sh',
      'not this one',
      '```',
    ].join('\n');
    expect(parseCommands(file)).toEqual([
      {
        title: 'List a folder',
        tags: ['files'],
        command: 'ls -la $1',
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
    const [entry] = parseCommands('## Two\n```\ncd $1\ngit pull\n```');
    expect(entry?.command).toBe('cd $1\ngit pull');
  });
});

describe('commandParameters', () => {
  it('counts up to the highest $n and ignores escaped ones', () => {
    expect(commandParameters('ls $1')).toBe(1);
    expect(commandParameters('cp $1 $2 && echo $1')).toBe(2);
    expect(commandParameters('echo $2')).toBe(2);
    expect(commandParameters("awk '{print \\$1}' $1")).toBe(1);
    expect(commandParameters('echo $HOME $0')).toBe(0);
  });
});

describe('fillCommand', () => {
  it('puts the values in as typed and unescapes \\$n', () => {
    expect(fillCommand('ls $1', ['-la /tmp'])).toBe('ls -la /tmp');
    expect(fillCommand('cp $1 $2 && echo $1', ['a', 'b'])).toBe('cp a b && echo a');
    expect(fillCommand("awk '{print \\$1}' $1", ['f.txt'])).toBe("awk '{print $1}' f.txt");
    expect(fillCommand('echo $2', [])).toBe('echo ');
  });
});
