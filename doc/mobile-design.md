# Mobile design spec

Status: draft, 2026-11-06. Scope: `apps/mobile` (Expo SDK 58, expo-router, React Native 0.88).
Source of truth for colour, type and metrics: `apps/mobile/src/theme/theme.ts`. Values below are quoted from it.

## 1. Purpose

The app must feel native on iOS and Android and still carry the console's brand.

Problems this design fixes:

| Problem | Fix |
| --- | --- |
| Flat dark screens with no hierarchy beyond colour | Platform surfaces, separators and grouped lists (§3, §8) |
| Green-outlined boxes on every control | Platform controls: filled, tinted, plain, outlined buttons (§11) |
| `Menlo` for all text. It exists only on iOS, and the web preview fell back to the browser's default serif | Per-platform font stacks; mono used for data only (§4) |
| No icons | One `Icon` component over SF Symbols and Material Symbols (§5) |
| No native navigation | Native stacks, large titles, native tab bar, native sheets (§7) |

## 2. Brand carry-over

The console (`apps/console`) is a mono "terminal" Life OS: JetBrains Mono, neon accent, dark panels. The logo (`apps/console/public/logo.svg`) is a Volt `#E6FF4A` "K" on Ink `#0C0D0C`.

| Element | Console | Mobile |
| --- | --- | --- |
| Accent | Neon green | Volt `#E6FF4A` (dark), Olive `#4F5E00` (light text, icons, links, selected tab) |
| Surfaces | Near-black panels | Ink-tinted near-black (`#0B0C0A`, `#1B1C19`, `#262723`) |
| Primary button | Accent fill | Volt fill with Ink text (dark). Ink fill with Volt text (light, logo inverted) |
| Typeface | JetBrains Mono everywhere | System font for UI and body. Mono only for data (below) |

Rules:

- Volt is the only accent. Status colours are separate (§3).
- Light mode: Volt on white is unreadable, so text and icon tint is Olive.
- Mono is for data only: numbers in stat tiles, file paths, code, timestamps. It is the terminal nod. Body and UI text never use it.
- Voice: sentence case in UI, short, direct verbs ("Capture", "Add todo"). Lowercase is fine for user content, which is shown as typed. No exclamation marks. No jargon.

## 3. Colour

### 3.1 Palette tokens

Values are exact. `†` marks a value inherited from the iOS palette by the spread in `theme.ts` (`androidLight = { ...iosLight, ... }`, `androidDark = { ...iosDark, ... }`).

| Token | iOS light | iOS dark | Android light | Android dark | Use |
| --- | --- | --- | --- | --- | --- |
| `background` | `#F3F3EF` | `#0B0C0A` | `#FBFBF2` | `#12130F` | Screen background. Grouped background on iOS |
| `surface` | `#FFFFFF` | `#1B1C19` | `#F0F1E6` | `#1E1F1A` | Cards, list sections, sheets |
| `surfaceElevated` | `#FFFFFF` | `#262723` | `#FFFFFF` | `#292A24` | Menus, pressed rows, chips, raised items on `surface` |
| `fill` | `rgba(118,118,128,0.12)` | `rgba(120,120,128,0.24)` | `#E4E4DA` | `#33352E` | Text field and segmented track backgrounds, neutral chips |
| `separator` | `rgba(60,60,67,0.29)` | `rgba(84,84,88,0.65)` | `#C6C8B8` | `#45483C` | Hairlines between rows, dividers |
| `label` | `#0C0D0C` | `#F4F5EF` | `#1B1C17` | `#E4E3DB` | Primary text |
| `secondaryLabel` | `rgba(60,60,67,0.76)` | `rgba(235,235,245,0.62)` | `#46483C` | `#C6C8B8` | Supporting text, metadata |
| `tertiaryLabel` | `rgba(60,60,67,0.3)` | `rgba(235,235,245,0.32)` | `#6A6C60` | `#8F9284` | Placeholder and disabled text only |
| `accent` | `#4F5E00` | `#E6FF4A` | `#4F5E00`† | `#E6FF4A`† | Tint for text, icons, links, selected tab |
| `accentFill` | `#0C0D0C` | `#E6FF4A` | `#0C0D0C`† | `#E6FF4A`† | Filled buttons, FAB |
| `onAccentFill` | `#E6FF4A` | `#0C0D0C` | `#E6FF4A`† | `#2C3400` | Text and icons on `accentFill` |
| `accentSoft` | `rgba(79,94,0,0.12)` | `rgba(230,255,74,0.16)` | `#DCEB8C` | `#414C00` | Tinted buttons, selected chips, badges |
| `onAccentSoft` | `#4F5E00` | `#E6FF4A` | `#181E00` | `#E6FF4A` | Text and icons on `accentSoft` |
| `success` | `#248A3D` | `#32D74B` | `#248A3D`† | `#32D74B`† | Saved, done |
| `warning` | `#B25000` | `#FFD60A` | `#B25000`† | `#FFD60A`† | Attention, stale data |
| `danger` | `#D70015` | `#FF453A` | `#D70015`† | `#FF453A`† | Errors, destructive actions |
| `info` | `#0071A4` | `#64D2FF` | `#0071A4`† | `#64D2FF`† | In progress, informational |
| `pressed` | `rgba(0,0,0,0.06)` | `rgba(255,255,255,0.08)` | `rgba(79,94,0,0.12)` | `rgba(230,255,74,0.12)` | iOS pressed overlay. Android ripple colour |

Notes:

- Android status colours are the iOS values (`†`). Material 3 tonal status colours are not generated yet (§14).
- On Android, `accent` and `accentFill` keep the iOS values, so Android light uses Olive text and Ink fills, as on iOS.

### 3.2 Contrast

Ratios computed from the exact values above (WCAG relative luminance). Body text needs 4.5:1. Large text and icons need 3:1.

| Pair | Ratio | Verdict |
| --- | --- | --- |
| Volt `#E6FF4A` on Ink `#0C0D0C` | 17.4:1 | Pass. Filled-button text, brand |
| Olive `#4F5E00` on white | 7.16:1 | Pass. Light accent text |
| Olive on Android light `background` `#FBFBF2` | 6.88:1 | Pass |
| `label` on iOS dark `background` (`#F4F5EF` on `#0B0C0A`) | 17.9:1 | Pass |
| `label` on Android dark `background` (`#E4E3DB` on `#12130F`) | 14.5:1 | Pass |
| `label` on Android light `background` (`#1B1C17` on `#FBFBF2`) | 16.5:1 | Pass |
| `onAccentFill` `#2C3400` on Android dark `accent` Volt | 11.7:1 | Pass |
| Volt on Android dark `accentSoft` `#414C00` | 8.3:1 | Pass |
| `onAccentSoft` `#181E00` on Android light `accentSoft` `#DCEB8C` | 13.3:1 | Pass |
| `secondaryLabel` on iOS dark `background` | 6.7:1 | Pass |
| `secondaryLabel` on Android dark `surface` | 9.8:1 | Pass |
| `secondaryLabel` on Android light `surface` | 8.2:1 | Pass |
| `secondaryLabel` on iOS light `white` | ≈5.1:1 | Pass |
| `tertiaryLabel` on Android dark `background` | 5.9:1 | Pass |
| `tertiaryLabel` on Android light `background` | ≈5.0:1 | Pass |
| `tertiaryLabel` on iOS dark `background` | 2.6:1 | **Fails** (placeholder and disabled only) |
| `tertiaryLabel` on iOS light `white` | 1.7:1 | **Fails** (placeholder and disabled only) |

### 3.3 Usage rules

- `label` carries all information the user needs to act on.
- `secondaryLabel` is for supporting text: subtitles, metadata, timestamps. It must never be the only carrier of meaning, and on iOS light it may not hold body-size text until the value is tuned (§14).
- `tertiaryLabel` is for placeholders and disabled controls only. It never carries information.
- Never convey state by colour alone. Pair `success`, `warning`, `danger` and `info` with an icon or text.
- `accentSoft` backgrounds always take `onAccentSoft` text, never `label`.

## 4. Typography

### 4.1 Font families

- `fontFamily.system` is `undefined` on native, so the platform system font applies: SF Pro on iOS, Roboto on Android.
- Web preview stack: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Inter, system-ui, sans-serif`.
- `fontFamily.mono` is `Menlo` on iOS, `monospace` on Android, and `ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace` on the web.

### 4.2 Variants

Format: size / line height · weight · letter spacing. Values are exact.

| Variant | iOS (HIG Large) | Android (M3) | Use |
| --- | --- | --- | --- |
| `largeTitle` | 34 / 41 · 700 · 0.4 | 32 / 40 · 400 · 0 | iOS large navigation title. Android: hero headings only |
| `title1` | 28 / 34 · 700 · 0.38 | 28 / 36 · 400 · 0 | Page headings inside content |
| `title2` | 22 / 28 · 700 · -0.26 | 24 / 32 · 400 · 0 | Section headings |
| `title3` | 20 / 25 · 600 · -0.45 | 22 / 28 · 400 · 0 | Android top app bar title. iOS card headings |
| `headline` | 17 / 22 · 600 · -0.43 | 16 / 24 · 500 · 0.15 | iOS inline navigation title. Row titles, emphasis |
| `body` | 17 / 22 · 400 · -0.43 | 16 / 24 · 400 · 0.5 | Default text |
| `callout` | 16 / 21 · 400 · -0.31 | 15 / 22 · 400 · 0.25 | Helper text, descriptions |
| `subheadline` | 15 / 20 · 400 · -0.23 | 14 / 20 · 400 · 0.25 | Row subtitles |
| `footnote` | 13 / 18 · 400 · -0.08 | 12 / 16 · 400 · 0.4 | Section footers, timestamps |
| `caption1` | 12 / 16 · 400 · 0 | 12 / 16 · 500 · 0.5 | Chips, badges |
| `caption2` | 11 / 13 · 400 · 0.06 | 11 / 16 · 500 · 0.5 | Stat tile labels |

### 4.3 Dynamic type

- `allowFontScaling` stays on (the default). Sizes come only from the `type` variants, never hard-coded.
- `largeTitle`, `title1`, `title2` and `title3` set `maxFontSizeMultiplier={1.6}` so headings do not outgrow their bars. Body and smaller variants scale to the system maximum.
- At 200% text size, layouts wrap and never truncate. Rows grow past `rowHeight`. `numberOfLines` is allowed only on decorative or duplicated text.
- Stat tile numbers (mono) wrap onto a second line rather than shrinking.

## 5. Iconography

- One component, `Icon` (`src/ui/icon.tsx`), wraps `SymbolView` from `expo-symbols` on every platform.
- Callers pass app-level names only. `Icon` maps each name to `{ ios: <SF Symbol>, android: <Material Symbol> }`, which `SymbolView` accepts as its `name` prop. Web uses the Material name.
- Unselected tabs and buttons use the outline variant. Selected tabs use the fill variant (SF `.fill` suffix, Material fill axis).
- Sizes: `17` inline with text, `22` row leading icons and navigation bar buttons, `28` empty states and stat tiles. Tab bar icons take the system size from `NativeTabs`.
- Icons are decorative unless they are the only content of a control. Decorative icons are hidden from accessibility. A control whose only content is an icon gets an `accessibilityLabel`.
- The name map is `IconDef` entries in `src/ui/icon.tsx`, the single vocabulary for icons. Examples: `home` (`house` / `home`), `board` (`square.grid.2x2` / `view_kanban`), `repos` (`externaldrive` / `database`), `signOut` (`rectangle.portrait.and.arrow.right` / `logout`).
- Open conflict: `icon.tsx` names most icons with their SF `.fill` variant as the default, so unselected controls would be filled. The rule above (outline for unselected, fill for selected) needs the map split into outline and fill names before the tab bar ships. See §14.2.

## 6. Shape, spacing and metrics

### 6.1 Spacing

`spacing` is the same on both platforms.

| Token | Value | Use |
| --- | --- | --- |
| `xxs` | 2 | Optical nudges between icon and label |
| `xs` | 4 | Tight groups: badge and label |
| `sm` | 8 | Chip padding, gaps in a row |
| `md` | 12 | Gaps between controls in a group |
| `lg` | 16 | Screen margin, card padding |
| `xl` | 24 | Gaps between sections |
| `xxl` | 32 | Empty-state spacing |

### 6.2 Radii

| Token | iOS | Android | Use |
| --- | --- | --- | --- |
| `sm` | 8 | 8 | Chips, small controls |
| `md` | 10 | 12 | Grouped list sections (iOS), text fields |
| `lg` | 14 | 16 | Cards, sheets |
| `button` | 12 | 999 | Filled and tinted buttons. Android uses pill buttons |
| `pill` | 999 | 999 | Segmented controls, badges, FAB |

### 6.3 Metrics

| Metric | iOS | Android | Use |
| --- | --- | --- | --- |
| `hitTarget` | 44 | 48 | Minimum touch target (pt / dp) |
| `rowHeight` | 44 | 56 | Minimum list row height. Rows grow with Dynamic Type |
| `buttonHeight` | 50 | 48 | Large button height |
| `screenMargin` | 16 | 16 | Horizontal screen margin |
| `separatorInset` | 16 | 0 | Leading inset of row hairlines. Android rows are full width |

Small buttons draw at 32 and extend their hit area to `hitTarget` with `hitSlop`. Medium buttons use `hitTarget` as their height.

## 7. Navigation architecture

### 7.1 Tree

```
app/
  _layout.tsx                 root Stack (native-stack)
  index.tsx                   root entry (unchanged)
  login.tsx                   Stack screen, no header
  (tabs)/_layout.tsx          NativeTabs host, five tabs
    (today)/_layout.tsx       Stack for Today
      dashboard.tsx           /dashboard
    (board)/_layout.tsx       Stack for Board
      board.tsx               /board
    (capture)/_layout.tsx     Stack for Capture
      capture.tsx             /capture (launcher)
    (ideas)/_layout.tsx       Stack for Ideas
      ideas.tsx               /ideas
    (more)/_layout.tsx        Stack for More
      more.tsx                /more
  analytics.tsx               pushed detail
  wiki.tsx                    pushed detail
  knowledge.tsx               pushed detail
  files/index.tsx             pushed detail, /files
  files/[...path].tsx         pushed detail, /files/...
  repos.tsx                   pushed detail
  quick-todo.tsx              modal sheet
  quick-note.tsx              modal sheet
  quick-log.tsx               modal sheet
  quick-idea.tsx              modal sheet
  quick-knowledge.tsx         modal sheet
```

Expo-router groups `(…)` do not appear in URLs, so every path above is unchanged and existing deep links keep working.

### 7.2 Tabs

| Tab | Path | Icon (outline / fill) | Content |
| --- | --- | --- | --- |
| Today | `/dashboard` | `home` | Dashboard tiles |
| Board | `/board` | `board` | Kanban over `.todos.md` files |
| Capture | `/capture` | `capture` | Launcher for the five quick-capture kinds |
| Ideas | `/ideas` | `ideas` | Ideas list |
| More | `/more` | `more` | Analytics, Wiki, Knowledge, Files, Repositories, Sign out |

- Tabs use expo-router `NativeTabs` (real `UITabBar` on iOS, Material `NavigationBar` on Android). The web preview uses JS tabs styled the same.
- Selected tab tint is `accent`. Tab labels are visible for selected and unselected tabs.
- Capture is a launcher, not a sheet. Each row pushes the matching `quick-*` modal.
- Sign out is the last row in More, styled with `danger` and confirmed first.

### 7.3 Modal sheets

| Route | Platform presentation |
| --- | --- |
| `quick-todo`, `quick-note`, `quick-log`, `quick-idea`, `quick-knowledge` | iOS: `pageSheet` with grabber. Android: full-screen modal with close icon |

Each quick screen has a single primary action in the header or footer. Saving uses a success haptic and dismisses. Failure stays on the sheet, shows the error inline, and uses an error haptic.

### 7.4 Headers

- Each tab has its own Stack, so headers are native to that tab.
- iOS: tab root screens set `headerLargeTitle`. The large title collapses on scroll. The ScrollView sets `contentInsetAdjustmentBehavior="automatic"`. Pushed screens use the inline `headline` title.
- Android: M3 top app bar. Title left-aligned in `title3`. No shadow (`headerShadowVisible: false`). Background is `colors.background`.
- The root Stack header style follows the same rules. There is no custom header bar.

### 7.5 Deep links

Unchanged: `kaihuman://board`, `kaihuman://quick-todo|note|log|idea|knowledge`, `kaihuman://files/...`, and the auth callback. Groups do not change paths, so `parseDeepLink` in `src/navigation/routes.ts` keeps its URLs.

## 8. Platform rules

### 8.1 iOS (HIG)

- Native-stack headers with large titles on tab roots (§7.4).
- Lists are inset grouped: 16 pt margin, `md` (10) radius, hairline separators inset by `separatorInset`. Settings-style coloured icon tiles lead rows where a row has a category icon.
- Row actions: current implementation uses a long-press action sheet. Upgrade path: `react-native-gesture-handler` `Swipeable` for swipe actions and a native context menu for long press.
- Sheets for capture (§7.3). No FAB.
- Haptics: `selection` on segmented control and tab changes. `impact` light on primary actions. `notification` success or error after save or failure.
- SF Symbols for all icons. Pressed state is an opacity change, not a colour change.

### 8.2 Android (Material 3)

- M3 top app bar (§7.4). Roboto. Material Symbols.
- Ripple from `android_ripple` on every pressable, colour `pressed`.
- Button shapes: filled, tonal (`accentSoft`), text, outlined. All pill-shaped.
- Text fields: M3 filled style, `fill` background, `md` (12) radius.
- Segmented buttons for two to five mutually exclusive options.
- FAB (`Fab`, Android only) for the primary create action on list screens: Board, Ideas, Files, Repositories. Not used on iOS.
- Edge-to-edge: content draws behind the status and navigation bars and is padded with safe-area insets.
- Bottom navigation bar with pill indicator (`NativeTabs`).
- Lists are full width without cards. Rows are 56 dp.

## 9. Light and dark

- `app.json` sets `userInterfaceStyle: "automatic"`. The app follows the system setting.
- `useTheme()` (in `theme.ts`) reads `useColorScheme()` and returns dark when the system reports none.
- The status bar style must follow the theme: light icons in dark mode, dark icons in light mode. The root layout sets `StatusBar` from `theme.scheme`.
- No view may hard-code a colour. Every colour comes from `useTheme().colors`. Hex literals belong only in `theme.ts`. Legacy `tokens.ts` is the exception until it is deleted (§13).
- The logo is the only asset that carries its own colours.

## 10. Accessibility

- Contrast: 4.5:1 for body text, 3:1 for large text and icons. Verified values are in §3.2. Known failures are listed in §14.
- Hit targets: 44 pt on iOS, 48 dp on Android (`metrics.hitTarget`). Small visuals extend their hit area with `hitSlop`.
- Every pressable has `accessibilityRole` and `accessibilityLabel`. A label names the action, not the icon ("Delete todo", not "trash").
- Icons are decorative unless they are the only content (§5).
- State goes in `accessibilityState` (`selected`, `checked`, `disabled`, `busy`), not only in colour.
- Reduce motion is respected: animations are skipped or shortened when the system setting is on.
- Dynamic type rules are in §4.3. Layouts must pass at 200%.
- Destructive actions are confirmed with a dialog that names the item.

## 11. Primitives catalogue (`src/ui/`)

Built on `theme.ts` and `useTheme()`. All 14 primitives below exist in `src/ui/` (uncommitted); `Divider` and `useInsets` are also there. None is used by a screen yet.

| Primitive | Use when |
| --- | --- |
| `Icon` | Any icon. Takes an app-level name, size `17`, `22` or `28` |
| `haptics` | Helpers `selection()`, `impact()`, `success()`, `error()` over `expo-haptics`. Call from the action, not from render |
| `Text` | Every text node. Takes a `variant` from `TextVariant` and applies `maxFontSizeMultiplier` for titles |
| `Screen` / `ScreenTitle` | Screen root with safe areas, background and margin. `ScreenTitle` sets the header for in-content titles |
| `Section` + `ListRow` | Grouped lists. `Section` gives the inset group (iOS) or full-width group (Android). `ListRow` gives the row with leading icon, title, subtitle and trailing accessory |
| `Button` | Actions. Variants: `filled`, `tinted`, `plain`, `outlined`, `destructive`. Sizes: `large` (`buttonHeight`), `medium` (`hitTarget`), `small` (32 visual) |
| `TextField` | Text input. M3 filled on Android, grouped field on iOS |
| `SegmentedControl` | Two to five mutually exclusive options in one view. Selection haptic |
| `Chip` | Filters and tags you can toggle. Selected uses `accentSoft` |
| `Badge` | Counts and short status labels. `caption1` on `accentSoft` or a status colour |
| `EmptyState` | A screen or section with no data. Icon at `28`, one line of `title3`, one `body` line, one primary `Button` |
| `Card` | A grouped block that is not a list. `surface` with `lg` radius on iOS; `surface` with no elevation on Android |
| `StatTile` | A single number with a `caption2` label. Value in mono |
| `Fab` | Android only: the primary create action on list screens. Renders nothing on iOS |

Legacy: `src/views/primitives.tsx` stays as a thin wrapper over `src/ui/` until its screens are restyled. `src/theme/tokens.ts` (the old Nexus palette) is still used by the root layout and legacy views and is deleted when the last import is gone (§13).

## 12. Web preview

- Build: `npx expo export --platform web` (output in `apps/mobile/dist/`).
- Serve `dist/` with any static server, then open it in a browser.
- The preview shows iOS styling by default. `?platform=android` switches it to Android styling (`designPlatform()` in `theme.ts`).
- Screenshots are taken with Playwright at two sizes and in both colour schemes:
  - iPhone 15 Pro: 393 × 852
  - Pixel 8: 412 × 915
  - Light and dark: emulate `colorScheme` in Playwright
- Each restyled screen gets one screenshot per platform and scheme (8 images). Check there is no horizontal page scroll at phone width.

## 13. Screen restyle checklist

Follow-up session. One bullet per screen. Each screen uses only `src/ui/` primitives and `useTheme()`, and passes §10 and §4.3 at 200% text.

- **Login** (`app/login.tsx`, `src/views/login-view.tsx`): no header. Logo, one filled `Button` for GitHub sign-in, one line of helper text.
- **Dashboard** (`app/dashboard.tsx`, `src/views/dashboard-view.tsx`, `tile-view.tsx`): Today tab. Tiles become `Card` and `StatTile`. Numbers in mono.
- **Board** (`app/board.tsx`, `src/views/kanban-view.tsx`): Board tab. Large title, `SegmentedControl` for status filter, `Chip` for tags, FAB on Android.
- **Capture** (new `app/(tabs)/(capture)/capture.tsx`): Launcher `Section` with five `ListRow`s (Todo, Note, Log, Idea, Knowledge), each pushing its `quick-*` sheet.
- **Ideas** (`app/ideas.tsx`, `src/views/ideas-view.tsx`): Ideas tab. `ListRow` list, `EmptyState`, FAB on Android.
- **Analytics** (`app/analytics.tsx`, `src/views/todo-analytics-view.tsx`): Pushed detail. `StatTile` row for velocity and totals, mono numbers, no coloured chart without a label.
- **Wiki** (`app/wiki.tsx`, `src/views/wiki-view.tsx`): Pushed detail. `[[wikilinks]]` styled with `accent`, backlinks in a `Section`.
- **Knowledge** (`app/knowledge.tsx`, `src/views/knowledge-view.tsx`): Pushed detail. Inbox as `ListRow`s with `Badge` counts.
- **Files** (`app/files/index.tsx`): Pushed detail. Tree as `ListRow`s with `folder` and `files` icons, paths in mono.
- **File editor** (`app/files/[...path].tsx`, `src/views/file-editor-view.tsx`): Pushed detail. Monospace editor body, `Button` for save, error haptic on failed save. `.enc` passphrase prompt as a `TextField` in a sheet.
- **Repositories** (`app/repos.tsx`, `src/views/repo-selector-view.tsx`): Pushed detail. `ListRow` per repo with a checkmark for the selected repo, FAB on Android.
- **Quick capture** (`app/quick-*.tsx`, `src/views/quick-capture-screen.tsx`, `quick-capture-view.tsx`): Five modal sheets over one shared screen. Single primary action in the header, `TextField` body, success and error haptics.
- **More** (new `app/(tabs)/(more)/more.tsx`): `Section` of `ListRow`s for Analytics, Wiki, Knowledge, Files, Repositories, then a `danger` Sign out row.

## 14. Status and known gaps

### 14.1 Status

| Item | State |
| --- | --- |
| `src/theme/theme.ts` (platform-aware palettes, type, shape, metrics, `useTheme`) | Committed in `f768ed0` |
| `expo-haptics` and `expo-symbols` in `apps/mobile/package.json` | Committed in `f768ed0`. Lockfile updated |
| This spec | Written. Not committed |
| `src/ui/` primitives, `Icon`, `haptics` | Written, uncommitted. All §11 names present. No screen uses them yet |
| Tab navigation (`NativeTabs`, per-tab Stacks, modal presentation, `(tabs)` group) | Not started. `app/_layout.tsx` still uses the old Stack and `tokens.ts`. No `(tabs)` directory |
| Screen restyle (§13) | Not started |

### 14.2 Known gaps

1. **Label contrast below 4.5:1.** `secondaryLabel` on iOS light is 3.6:1. `tertiaryLabel` is 4.3:1 on Android light, 2.6:1 on iOS dark and 1.7:1 on iOS light. The usage rules in §3.3 limit where these may appear. Tuning the values in `theme.ts` is a decision for the follow-up, because it changes the quoted values in §3.1.
2. **Android status colours are iOS values.** `success`, `warning`, `danger` and `info` on Android come from the iOS palette through the spread in `theme.ts`. Generating Material 3 tonal status colours is a follow-up.
3. **Brand contrast figure.** Volt on Ink is 17.4:1 (computed), not the ≈16:1 in the brief. §3.2 uses the computed value.
4. **Icon outline and fill.** `src/ui/icon.tsx` uses the SF `.fill` variant as the default for most names. §5 requires outline for unselected controls and fill for selected tabs. Split the map into outline and fill names before the tab bar ships.
5. **Open question: detail routes.** Analytics, Wiki, Knowledge, Files and Repositories are pushed on the root Stack, which hides the tab bar while open. Nesting them under the More tab would keep the tab bar visible. This spec keeps them on the root Stack, as decided, and the question can be revisited after the restyle.
