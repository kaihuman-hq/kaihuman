# Mobile redesign (2026-11-10)

Mockups, approved and implemented. Renders of the real app (web preview, 2×): `impl-*.png` (dashboard page 1 and 2, quick menu, todos detail and add, settings; light and dark).
Source: `*.html` (shared `kit.css`, `kit.js`). Render: `node render.mjs` (global Playwright, 2× PNG).

| File | Shows |
| --- | --- |
| `dashboard-page1.png` | Today page: todos, habit, time, coffee, events, budget, board, log |
| `dashboard-page2.png` | Second dashboard: stocks, clocks, travel, weight, read later, feeds, bookmarks, prompts |
| `tiles-gallery.png` | All 18 tile kinds (+ meter variant), light and dark |
| `quick-menu.png` | Center "+" tab open: Capture + Track sheet |
| `todos.png` | Todos tile, detail list, add sheet |
| `ios-widgets.png` | Small/medium Today, Habit, Habits, Timer, Capture |

## Decisions

1. **Square tiles only.** 2 columns, 174×174 on a 393 pt screen, 13 pt gaps. `TILE_SIZE` compact/medium/full goes away.
2. **Tile anatomy:** icon chip + name · flexible space · one hero number (mono) · one label · one tiny visual (≤ 40 pt: 7-day row, sparkline, segment bar, mini bars). All tiles share baselines.
3. **Tap = deep dive** (existing `/dashboard/tile?path=…`, opened with a zoom transition).
4. **Quick action button** (top-right, 30 pt) only when the entry is one tap or one field: todos +, habit ✓, timer start/stop, consumption +, budget +, log +, events +, travel +, data +, read later +, bookmarks +.
5. **Todos tile = counts** (open, doing, overdue + status bar). The list moves to the detail screen: segmented Today · Doing · Open · Done. Adding uses its own sheet with chips.
6. **Shortcut row removed from page 1.** Tab bar becomes Today · Board · ＋ · Ideas · More. ＋ opens a sheet: Capture (Todo, Note, Log, Idea, Knowledge) and Track (one-tap entries built from the user's tiles). Long-press ＋ repeats the last action. Deep links are unchanged.
7. **Palette settings** is not a glance tile: it moves to More → Settings.
8. **iOS widgets:** Today shows only today's tasks (due today + overdue + in progress). Habit small = streak + one 7-day row with in-widget ✓. New Habits medium, Timer small. Snapshot needs `todayItems`, `habits[].days[7]` and `timer`.

## Animation notes

Tile press: spring scale .96 + light haptic. Open: shared-element zoom. Quick add: button pop, hero number rolls, success haptic. Sheet: scrim fade 180 ms, spring up, items stagger 20 ms, ＋ rotates to ×. Remove item: swipe, height collapse 220 ms, rows spring up. Check: ring fill + stroke draw, row slides out after a 600 ms undo window. Page swipe: dots stretch, tiles stagger 30 ms.

## Web vs mobile gaps (current mobile summary card → new tile)

| Kind | Web has | Mobile card today | New tile adds |
| --- | --- | --- | --- |
| habit | check-in, streak, heatmap | streak + last 3 days as text | 7-day row, ✓ action |
| timetracking | timer, today total, charts | elapsed or idle | live timer, 7-day bars, start/stop |
| budget | category chart, add form | net + income/spent | left-of-limit hero, category bar, + |
| stocks | value, profit, charts | value + profit | sparkline |
| consumption | meters, year compare charts | meter list | count pills or meter sparkline + vs last year, + |
| datacollection | line/delta charts, add row | row count | latest value + trend sparkline, + |
| events | upcoming, add | count + names | days-to-next countdown, + |
| actionlog | list, tags, search | count + lines | today count + last entry with time, + |
| boardoverview | column counts, overdue | counts as text | column mini bars, overdue colour |
| travel | countdown, steps, maps | days + trips | countdown, step count, + |
| readitlater / rss / bookmarks | lists, add, tags | count + titles | count + top item / favicons |
| prompts / commands | search, copy | count + titles | copy chip for the most used item |
| timezones | live clocks | clocks | live home clock + 2 cities |
| todos | full list + boards | full inline tile | counts tile; list in detail |
| palettesettings | engines editor | enabled count | moved to More → Settings |

Only web view with no mobile kind: the generic CSV table (`CsvTableView`), which is a file view, not a dashboard tile.
