export const KB_SKILL_VERSION = '1.0.0';

export const KB_INGEST_SKILL = `# /kb-ingest

Ingest raw markdown files into the knowledge base wiki.

## Process

1. Read \`.kh/schema.md\` to understand domain, page format, and index structure
2. Read existing wiki pages from \`.kh/wiki/\` to understand current state
3. Find all unprocessed raw files in \`.kh/raw/\` (those without \`processed: true\` in frontmatter)
4. For each unprocessed file:
   - Extract key concepts and entities
   - Create or update corresponding wiki pages in \`.kh/wiki/\`
   - Add backlinks between related pages
   - Update \`.kh/index.md\` with new entries and maintain structure
   - Append processing notes to \`.kh/log.md\`
   - Add \`processed: true\` to the file's frontmatter
5. Commit changes with meaningful message

## Input

The raw files to process are in \`.kh/raw/\`. Each can contain domain-specific knowledge that needs to be organized into wiki pages.

## Output

- Updated wiki pages in \`.kh/wiki/\`
- Updated \`.kh/index.md\` with new entries
- Updated \`.kh/log.md\` with processing notes
- Raw files marked with \`processed: true\`
`;

export const KB_LINT_SKILL = `# /kb-lint

Audit and repair the knowledge base.

## Audits

Check for:
- **Contradictions**: Conflicting information in wiki pages about the same topic
- **Orphans**: Wiki pages not referenced in index.md
- **Dead links**: Wiki pages linking to non-existent pages
- **Missing links**: Related pages that should be linked but aren't
- **Index drift**: Index structure not matching actual wiki organization

## Repairs

Fix automatically where possible:
- Add missing backlinks between related pages
- Remove dead links from pages
- Update index.md to include orphaned pages
- Add missing cross-references

## Output

Append audit and repair summary to \`.kh/log.md\` with:
- Issues found
- Repairs made
- Recommendations for manual review
`;

export const KB_ASK_SKILL = `# /kb-ask

Answer questions using the knowledge base.

## Process

1. Read \`.kh/index.md\` to understand wiki structure
2. Identify relevant wiki pages for the question in $ARGUMENTS
3. Read relevant pages from \`.kh/wiki/\`
4. Synthesize answer based on knowledge base content
5. Include citations linking to source wiki pages

## Input

Question or query passed via $ARGUMENTS

## Output

Comprehensive answer with citations to wiki pages that support the answer.
`;

export const KB_SCHEMA_TEMPLATE = `# Knowledge Base Schema

## Domain

**Domain**: [Domain name or topic area]

## Wiki Page Format

Each wiki page uses the following structure:

\`\`\`markdown
---
title: Page Title
tags: [tag1, tag2, tag3]
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

## Overview
[Brief summary of the topic]

## Key Concepts
[Main ideas and definitions]

## Details
[In-depth information]

## Related Topics
- [[Link to related page 1]]
- [[Link to related page 2]]
\`\`\`

## Index Format

The \`.kh/index.md\` file maintains the structure:

\`\`\`markdown
# Knowledge Base Index

## Category 1
- [[Page Title 1]]
- [[Page Title 2]]

## Category 2
- [[Page Title 3]]
- [[Page Title 4]]
\`\`\`

## Tags

Standard tags for categorization:

- \`concept\`: Fundamental ideas
- \`definition\`: Terminology and definitions
- \`procedure\`: Step-by-step processes
- \`reference\`: Reference materials
- \`example\`: Examples and case studies

## Scope

This knowledge base covers:
- [Scope item 1]
- [Scope item 2]
- [Scope item 3]
`;

export function getScaffoldFiles(): Record<string, string> {
  return {
    '.kh/.skill-version': KB_SKILL_VERSION,
    '.kh/schema.md': KB_SCHEMA_TEMPLATE,
    '.kh/index.md':
      '# Knowledge Base Index\n\n## Getting Started\n\nWelcome to your knowledge base. Start by reading the schema in `.kh/schema.md` to understand the structure.\n',
    '.kh/log.md': '# Knowledge Base Log\n\nProcessing and audit history.\n',
    '.kh/raw/.gitkeep': '',
    '.kh/wiki/.gitkeep': '',
    '.claude/commands/kb-ingest.md': KB_INGEST_SKILL,
    '.claude/commands/kb-lint.md': KB_LINT_SKILL,
    '.claude/commands/kb-ask.md': KB_ASK_SKILL,
  };
}

export function getSkillOnlyFiles(): Record<string, string> {
  return {
    '.kh/.skill-version': KB_SKILL_VERSION,
    '.claude/commands/kb-ingest.md': KB_INGEST_SKILL,
    '.claude/commands/kb-lint.md': KB_LINT_SKILL,
    '.claude/commands/kb-ask.md': KB_ASK_SKILL,
  };
}
