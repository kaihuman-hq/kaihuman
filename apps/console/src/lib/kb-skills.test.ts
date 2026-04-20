import { describe, expect, it } from 'vitest';
import {
  getScaffoldFiles,
  getSkillOnlyFiles,
  KB_ASK_SKILL,
  KB_CLAUDE_MD,
  KB_INGEST_SKILL,
  KB_LINT_SKILL,
  KB_SCHEMA_TEMPLATE,
  KB_SESSION_SKILL,
  KB_SKILL_VERSION,
} from './kb-skills';

describe('KB_SKILL_VERSION', () => {
  it('matches semver pattern', () => {
    expect(KB_SKILL_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('skill templates', () => {
  it('KB_INGEST_SKILL is non-empty', () => {
    expect(KB_INGEST_SKILL.length).toBeGreaterThan(0);
  });

  it('KB_LINT_SKILL is non-empty', () => {
    expect(KB_LINT_SKILL.length).toBeGreaterThan(0);
  });

  it('KB_ASK_SKILL contains $ARGUMENTS placeholder', () => {
    expect(KB_ASK_SKILL).toContain('$ARGUMENTS');
  });

  it('KB_SCHEMA_TEMPLATE is non-empty', () => {
    expect(KB_SCHEMA_TEMPLATE.length).toBeGreaterThan(0);
  });
});

describe('getScaffoldFiles', () => {
  it('returns all required paths', () => {
    const files = getScaffoldFiles();
    expect(files).toHaveProperty('.kh/.skill-version', KB_SKILL_VERSION);
    expect(files).toHaveProperty('.kh/schema.md');
    expect(files).toHaveProperty('.kh/index.md');
    expect(files).toHaveProperty('.kh/log.md');
    expect(files).toHaveProperty('.kh/raw/.gitkeep');
    expect(files).toHaveProperty('.kh/wiki/.gitkeep');
    expect(files).toHaveProperty('.claude/commands/kb-ingest.md', KB_INGEST_SKILL);
    expect(files).toHaveProperty('.claude/commands/kb-lint.md', KB_LINT_SKILL);
    expect(files).toHaveProperty('.claude/commands/kb-ask.md', KB_ASK_SKILL);
    expect(files).toHaveProperty('.claude/commands/kb-session.md', KB_SESSION_SKILL);
    expect(files).toHaveProperty('CLAUDE.md', KB_CLAUDE_MD);
  });
});

describe('getSkillOnlyFiles', () => {
  it('contains exactly the skill version file, four command files, and CLAUDE.md', () => {
    const files = getSkillOnlyFiles();
    expect(Object.keys(files)).toHaveLength(6);
    expect(files).toHaveProperty('.kh/.skill-version', KB_SKILL_VERSION);
    expect(files).toHaveProperty('.claude/commands/kb-ingest.md');
    expect(files).toHaveProperty('.claude/commands/kb-lint.md');
    expect(files).toHaveProperty('.claude/commands/kb-ask.md');
    expect(files).toHaveProperty('.claude/commands/kb-session.md');
    expect(files).toHaveProperty('CLAUDE.md', KB_CLAUDE_MD);
  });

  it('does not include data files like index.md or schema.md', () => {
    const files = getSkillOnlyFiles();
    expect(files).not.toHaveProperty('.kh/index.md');
    expect(files).not.toHaveProperty('.kh/schema.md');
  });
});
