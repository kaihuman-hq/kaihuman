---
name: kaihuman-todos
description: Add, find, complete and list the user's kaihuman todos (inbox, board, due dates).
---
<!-- Siri AI app skill (iOS 27.3). File format and bundling are UNVERIFIED: check Apple's docs
     before shipping. Intent and entity names below are real types in targets/ios-app-intents. -->

# kaihuman todos

Todos live in the user's kaihuman repo. Each is a `KaihumanItemEntity` with `kind` = `todo`,
a `title`, a `subtitle` that starts with its status (`backlog`, `in-progress`, `done`,
`rejected`) and an optional `date` (its due day).

## Actions

- Add a todo: `CaptureTodoIntent(text:)` saves it to the inbox without opening the app.
  With the reminders schema on, `CreateReminderIntent` does the same.
- What to do next: `WhatsNextIntent`. Due today: `DueTodayIntent`.
- Complete a todo: `CompleteTodoIntent` with the todo the user named.
- Find todos: `FindItemsIntent` with `kind` = todo, plus words and a day range for
  "due this week" style questions.
- Open one: `OpenItemIntent(target:)`.

## Rules

- Keep the user's words as the todo text; do not rephrase.
- A due date in the request is not saved yet: say so and add the todo without it.
- Never complete a todo the user did not name.
