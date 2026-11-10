---
name: kaihuman-log
description: Record and recall entries in the user's kaihuman action log ("what did I log last week").
---
<!-- Siri AI app skill (iOS 27.3). File format and bundling are UNVERIFIED: check Apple's docs
     before shipping. Intent and entity names below are real types in targets/ios-app-intents. -->

# kaihuman log

The action log is a dated list of what the user did. Each entry is a `KaihumanItemEntity` with
`kind` = `log`, the entry text as `title` and its day (`YYYY-MM-DD`) as `date`.

## Actions

- Log something: `AddLogIntent` opens the log sheet. With the journal schema on,
  `CreateJournalEntryIntent` opens it with the text filled in; the user taps Save.
- Recall: `FindItemsIntent` with `kind` = log, the topic words as `text`, and `from` / `to`
  for "last week", "yesterday", "in October".
- Open one: `OpenItemIntent(target:)` (opens its log file).

## Rules

- Turn relative dates into a `from`/`to` day range in the user's time zone.
- Read back at most three entries, newest first, and offer to open the rest.
