# @lifosy/docspack

kaihuman's documentation as a [docspack](https://docspack.dev) package: every app, package,
repo file format and CLI command, written for AI agents and answered from a local index.

## Use it

```sh
pnpm add -D docspack @lifosy/docspack
npx docspack sync
npx docspack ask "where are todos stored"
```

## Work on it

The source is Markdown in `docs/` (one `##` heading per question) and `cmdspec.yaml`, which
describes the `cli` binary in `apps/cli`. The `.llms/` payload and `llms.txt` are build output.

```sh
pnpm --filter @lifosy/docspack build    # docspack build
pnpm --filter @lifosy/docspack lint     # build + docspack doctor --strict
pnpm --filter @lifosy/docspack test     # build + docspack eval, at least 90% of eval/queries.json in the top 3
pnpm --filter @lifosy/docspack exec docspack preview "how do I capture a note"
```

When a change in the repo alters behaviour that these docs describe, update the matching file
in `docs/` in the same change, and add a question to `eval/queries.json` for anything new.
