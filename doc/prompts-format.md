# `.prompts.md` — prompt library format

A single markdown file holding many reusable prompts. Each prompt has a title,
tags, and the prompt text itself.

```markdown
# Prompts

## Refactor to hooks #react #refactor

Convert the class component below into a function component using hooks.
Keep the public props identical.

## Commit message #git #ai

Write a conventional-commit message for the staged diff.
```

## Grammar

1. A prompt starts at a line matching `## ` at column 0.
2. Tags are `#tag` tokens on that heading line. What remains is the title.
3. The body runs to the next `## ` heading, or to the end of the file.

Everything before the first `## ` is ignored, so the `# Prompts` title line is
decoration. Tag characters are `[\w-]`, the same set `.todos.md` and
`.actionlog.md` use for their inline tags.

A body line that itself opens with `## ` is written with a leading backslash
(`\## `) — a standard markdown escape that renders as a literal `## ` and is
stripped again on read. This is the only escaping in the format.

## Searching from outside the app

The format is line-oriented on purpose: a prompt's title, its tags and its
position all live on one line, so anything that can read the raw file can search
it with no index, no sidecar and no parser.

```sh
# every prompt, with title, tags and line number
grep -n '^## ' notes/my.prompts.md

# find by tag
grep -n '^## .*#react' notes/my.prompts.md

# find by title text
grep -n '^## .*commit' -i notes/my.prompts.md

# titles only, tags stripped
sed -n 's/^## //p' notes/my.prompts.md | sed 's/ *#[[:alnum:]_-]*//g'

# extract one prompt's body (padded with the blank lines around it)
awk '/^## /{p=0} /^## Commit message/{p=1;next} p' notes/my.prompts.md
```

Because each prompt is an H2, GitHub also renders the file as a browsable list
and gives every prompt a heading anchor, so a single prompt can be linked
directly: `my.prompts.md#refactor-to-hooks-react-refactor`.

## In the app

Creating the file: **New File → Prompts**.

The widget parses the file into a searchable list — free-text search across
titles, bodies and tags, a frequency-sorted tag cloud to filter by tag, a click
to expand a prompt's body, and a copy button per prompt. **ADD PROMPT** appends
a new one.

Implementation: `packages/formats/src/prompts.ts` (parse/serialize, shared by the console and
both command palettes) and `packages/ui/src/LifeOS/Organisms/Widgets/PromptsWidget.tsx` (UI).
Parser tests live in `packages/formats/src/prompts.test.ts`.

## Known edges

- A `#` followed by word characters anywhere in a heading reads as a tag, so a
  title like `Fix issue #42` yields the tag `42`. This matches how `.todos.md`
  and `.actionlog.md` already treat inline tags.
- Titles are not unique keys. Two prompts may share a title; they stay separate
  entries.
