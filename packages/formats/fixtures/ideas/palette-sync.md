---
title: "Offline sync: the desktop palette"
status: exploring
product: kaihuman
tags: [palette, sync]
created: 2026-10-13T09:12+02:00
updated: 2026-10-14T18:40+02:00
links:
  - wiki/crdt.md
  - .kh/projects.todos.md
---

# Offline sync: the desktop palette

The palette works with no network and syncs when it comes back.
Worth it only if it stays simpler than the braindump sync.

## Log

- 2026-10-14 18:40 · claude · Status seed → exploring. Braindump sync already solves 80%; reuse it.
- 2026-10-14 18:31 · gemini · Researched CRDTs: too heavy for single-user data. → [[wiki/crdt]]
- 2026-10-13 09:12 · human · Created.

## Challenges

- [ ] Conflicts when two devices edit the same file offline.
- [x] Does the extension need it too? No: it is always online.

## Braindump

Palette should work on the train. Maybe just queue writes like `capture` does?

Also: what about the settings file?
