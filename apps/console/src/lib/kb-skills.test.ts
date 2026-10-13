import { describe, expect, it } from 'vitest';
import {
  getScaffoldFiles,
  getSkillOnlyFiles,
  KB_ASK_SKILL,
  KB_CLAUDE_MD,
  KB_DIGEST_SKILL,
  KB_INDEX_SKILL,
  KB_INGEST_SKILL,
  KB_LINT_SKILL,
  KB_LOG_FORMAT,
  KB_SCHEMA_TEMPLATE,
  KB_SESSION_SKILL,
  KB_SKILL_VERSION,
  KH_IDEAS_SKILL,
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
    expect(files).toHaveProperty('.kh/index.kb.md');
    expect(files).toHaveProperty('.kh/log.md');
    expect(files).toHaveProperty('.kh/raw/.gitkeep');
    expect(files).toHaveProperty('.kh/journal/.gitkeep');
    expect(files).toHaveProperty('.kh/wiki/.gitkeep');
    expect(files).toHaveProperty('.claude/commands/kb-ingest.md', KB_INGEST_SKILL);
    expect(files).toHaveProperty('.claude/commands/kb-index.md');
    expect(files).toHaveProperty('.claude/commands/kb-lint.md', KB_LINT_SKILL);
    expect(files).toHaveProperty('.claude/commands/kb-ask.md', KB_ASK_SKILL);
    expect(files).toHaveProperty('.claude/commands/kb-session.md', KB_SESSION_SKILL);
    expect(files).toHaveProperty('.claude/commands/kb-digest.md', KB_DIGEST_SKILL);
    expect(files).toHaveProperty('.claude/commands/kb-agent-capture.md');
    expect(files).toHaveProperty('CLAUDE.md', KB_CLAUDE_MD);
    expect(files).toHaveProperty('AGENTS.md', KB_CLAUDE_MD);
    expect(files).toHaveProperty('.kh/ideas/.gitkeep', '');
    expect(files).toHaveProperty('.agents/skills/kh-ideas/SKILL.md', KH_IDEAS_SKILL);
    expect(files).toHaveProperty('.claude/skills/kh-ideas/SKILL.md', KH_IDEAS_SKILL);
  });

  it('seeds the index with a section per page type', () => {
    const index = getScaffoldFiles()['.kh/index.kb.md'];
    for (const section of ['Topics', 'Entities', 'Concepts', 'Sources', 'Questions']) {
      expect(index).toContain(`## ${section}`);
    }
  });
});

describe('knowledge base conventions', () => {
  const pageTypes = ['source', 'entity', 'concept', 'topic', 'question'];

  it('CLAUDE.md defines the log format and every page type', () => {
    expect(KB_CLAUDE_MD).toContain(KB_LOG_FORMAT);
    for (const type of pageTypes) expect(KB_CLAUDE_MD).toContain(`\`${type}\``);
  });

  it('the schema template documents type and sources frontmatter', () => {
    expect(KB_SCHEMA_TEMPLATE).toContain('type: concept');
    expect(KB_SCHEMA_TEMPLATE).toContain('sources: [');
    for (const type of pageTypes) expect(KB_SCHEMA_TEMPLATE).toContain(`\`${type}\``);
  });

  it.each([
    ['ingest', KB_INGEST_SKILL],
    ['query', KB_ASK_SKILL],
    ['lint', KB_LINT_SKILL],
    ['index', KB_INDEX_SKILL],
    ['digest', KB_DIGEST_SKILL],
  ])('the %s command logs with the shared heading format', (op, skill) => {
    expect(skill).toContain(`## [YYYY-MM-DD] ${op} | `);
  });
});

describe('command behaviour', () => {
  it('/kb-ask files answers back into the wiki', () => {
    expect(KB_ASK_SKILL).toContain('--save');
    expect(KB_ASK_SKILL).toContain('type: question');
  });

  it('/kb-ingest discusses each source unless run with --batch', () => {
    expect(KB_INGEST_SKILL).toContain('--batch');
    expect(KB_INGEST_SKILL).toContain('wait for the answer before writing');
  });

  it('/kb-lint looks for stale claims and suggests what to research', () => {
    expect(KB_LINT_SKILL).toContain('Stale claims');
    expect(KB_LINT_SKILL).toContain('## Suggestions');
  });

  it('/kb-digest reads personal data read-only and writes a raw source', () => {
    for (const file of ['*.actionlog.md', '*.habit.csv', '*.todos.md', 'dump.md']) {
      expect(KB_DIGEST_SKILL).toContain(file);
    }
    expect(KB_DIGEST_SKILL).toContain('Never modify the files you read');
    expect(KB_DIGEST_SKILL).toContain('tags: [digest, personal]');
  });
});

describe('getSkillOnlyFiles', () => {
  it('contains the skill version file, seven commands, the ideas skill, CLAUDE.md and AGENTS.md', () => {
    const files = getSkillOnlyFiles();
    expect(Object.keys(files)).toHaveLength(12);
    expect(files).toHaveProperty('.kh/.skill-version', KB_SKILL_VERSION);
    expect(files).toHaveProperty('.claude/commands/kb-ingest.md');
    expect(files).toHaveProperty('.claude/commands/kb-index.md');
    expect(files).toHaveProperty('.claude/commands/kb-lint.md');
    expect(files).toHaveProperty('.claude/commands/kb-ask.md');
    expect(files).toHaveProperty('.claude/commands/kb-session.md');
    expect(files).toHaveProperty('.claude/commands/kb-digest.md');
    expect(files).toHaveProperty('.claude/commands/kb-agent-capture.md');
    expect(files).toHaveProperty('.agents/skills/kh-ideas/SKILL.md', KH_IDEAS_SKILL);
    expect(files).toHaveProperty('.claude/skills/kh-ideas/SKILL.md', KH_IDEAS_SKILL);
    expect(files).toHaveProperty('CLAUDE.md', KB_CLAUDE_MD);
    expect(files).toHaveProperty('AGENTS.md', KB_CLAUDE_MD);
  });

  it('does not include data files like index.md or schema.md', () => {
    const files = getSkillOnlyFiles();
    expect(files).not.toHaveProperty('.kh/index.kb.md');
    expect(files).not.toHaveProperty('.kh/schema.md');
    expect(files).not.toHaveProperty('.kh/ideas/.gitkeep');
  });
});

describe('ideas skill', () => {
  it('is the kh-ideas Agent Skill with its frontmatter', () => {
    expect(KH_IDEAS_SKILL).toMatch(/^---\nname: kh-ideas\n/);
  });

  it('CLAUDE.md points to the skill and the ideas folder', () => {
    expect(KB_CLAUDE_MD).toContain('## Ideas');
    expect(KB_CLAUDE_MD).toContain('.kh/ideas/<slug>.md');
    expect(KB_CLAUDE_MD).toContain('.agents/skills/kh-ideas/SKILL.md');
  });
});
