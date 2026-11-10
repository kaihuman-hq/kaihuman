---
name: kaihuman-notes
description: Write, find and open the user's kaihuman notes (Markdown files in their repo).
---
<!-- Siri AI app skill (iOS 27.3). File format and bundling are UNVERIFIED: check Apple's docs
     before shipping. Intent and entity names below are real types in targets/ios-app-intents. -->

# kaihuman notes

Notes are Markdown files. Each is a `KaihumanItemEntity` with `kind` = `note`, its first line
as `title` and its folder as `subtitle`. With the journal schema on, they are also
`KaihumanJournalEntryEntity` values.

## Actions

- New note: `AddNoteIntent` opens the note sheet. With the journal schema on,
  `CreateJournalEntryIntent` opens it with the text filled in; the user taps Save.
- Find notes: `FindItemsIntent` with `kind` = note and the user's words, or
  `SearchJournalEntriesIntent` / `SearchKaihumanIntent` for the in-app search screen.
- Open one: `OpenItemIntent(target:)`.

## Rules

- A note is saved only when the user taps Save in the app. Do not say it is saved before that.
- Quote titles as they are; notes are private, so do not summarise them aloud unless asked.
