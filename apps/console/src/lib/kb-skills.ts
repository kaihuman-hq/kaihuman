export const KB_SKILL_VERSION = '1.1.0';

export const KB_INGEST_SKILL = `# /kb-ingest

Ingest raw markdown files into the knowledge base wiki.

## Process

1. Read \`.kh/schema.md\` to understand domain, page format, and index structure
2. Read existing wiki pages from \`.kh/wiki/\` to understand current state
3. Find all unprocessed raw files in \`.kh/raw/\` (where frontmatter has \`processed: false\`)
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

export const KB_SESSION_SKILL = `# /kb-session

Summarize this Claude Code session and save it to the knowledge base.

## Config

Read \`~/.claude/kb.json\`. Expected format:
\`\`\`json
{ "repo": "owner/repo-name" }
\`\`\`

If the file does not exist or \`repo\` is missing, ask the user once:
> "What is your knowledge base repo? (e.g. adam/notes)"

Then save it and never ask again:
\`\`\`bash
echo '{"repo":"OWNER/REPO"}' > ~/.claude/kb.json
\`\`\`

## Write the summary

Summarize this session concisely (under 300 words):
- What project/repo was worked on
- What was built or changed — name specific files, functions, decisions
- Problems encountered and how they were resolved
- Anything worth remembering for future sessions

## Save to KB

Build the note, then write it using the \`gh\` CLI:

~~~bash
REPO=$(cat ~/.claude/kb.json | grep -o '"repo":"[^"]*"' | cut -d'"' -f4)
TIMESTAMP=$(date +%s)
DATE=$(date +%Y-%m-%d)
PROJECT=$(basename "$PWD")
SLUG="$PROJECT-session"
CONTENT=$(printf -- '---\ntitle: "Session: %s – %s"\nurl: '"''"'\ndate: %s\nprocessed: false\ntags: [session]\n---\n\n%s' "$PROJECT" "ONE_LINE_SUMMARY" "$DATE" "FULL_SUMMARY" | base64 -w 0)
gh api "repos/$REPO/contents/.kh/raw/$TIMESTAMP-$SLUG.md" \
  --method PUT \
  --field message="note: add session summary for $PROJECT" \
  --field "content=$CONTENT"
~~~

Confirm with the path that was written.
`;

export const KB_CLAUDE_MD = `# Knowledge Base

This repo is a personal AI knowledge base managed with Claude Code.

## Structure

\`\`\`
.kh/
  raw/        # Pinned articles (frontmatter: processed: false → true)
  wiki/       # Compiled knowledge pages with backlinks
  schema.md   # Domain definition and page format rules
  index.md    # Master index of all wiki pages
  log.md      # Processing and audit history
.claude/commands/
  kb-ingest.md  # /kb-ingest — compile raw articles into wiki
  kb-lint.md    # /kb-lint  — audit and repair wiki
  kb-ask.md     # /kb-ask   — answer questions from wiki
\`\`\`

## Workflow

1. Articles are pinned via the browser extension → land in \`.kh/raw/\` with \`processed: false\`
2. Run \`/kb-ingest\` to compile them into \`.kh/wiki/\` pages
3. Run \`/kb-lint\` periodically to fix orphans, dead links, and contradictions
4. Run \`/kb-ask <question>\` to query the knowledge base

## Guidelines

- Always read \`.kh/schema.md\` before creating or editing wiki pages
- Wiki pages use \`[[wikilink]]\` syntax for cross-references
- Keep raw files intact after processing — only the frontmatter changes
- The index in \`.kh/index.md\` is the canonical entry point for navigation
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
    '.claude/commands/kb-session.md': KB_SESSION_SKILL,
    'CLAUDE.md': KB_CLAUDE_MD,
  };
}

export function getSkillOnlyFiles(): Record<string, string> {
  return {
    '.kh/.skill-version': KB_SKILL_VERSION,
    '.claude/commands/kb-ingest.md': KB_INGEST_SKILL,
    '.claude/commands/kb-lint.md': KB_LINT_SKILL,
    '.claude/commands/kb-ask.md': KB_ASK_SKILL,
    '.claude/commands/kb-session.md': KB_SESSION_SKILL,
    'CLAUDE.md': KB_CLAUDE_MD,
  };
}
