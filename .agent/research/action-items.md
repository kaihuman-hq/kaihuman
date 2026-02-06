# Action Items

## 1. Bugs

[x] 1.1 From the status bar, clicking on one recent file, currently does not open the file properly. Implement the following: open the files view and navigate to the folder where file is located and open the file.
[x] 1.2 Fix repo selection to open the newly selected repo instead of the default one.
[x] 1.3 Files that have been saved must also be considered in the recently opened files list in .lifosy directory. Fix it. Make sure there is a limit of 10 files.
[x] 1.4 Clicking on Bookmark/Read it later, does not add the entry to the .lifosy/readitlater.json file anymore. This was already working. Investigate and fix it.
[x] 1.5 In mobile safari the top bar is not adjusted to the theme color. It is white instead of dark. Implement it.
[x] 1.6 In Mobile Safari: Switching to Zen Mode in the Editor in Focus Mode, switches the colors of the top bar and bottom bar to white. But it should be dark. Implement it.
[x] 1.7 In Mobile Mode the Icons for Arrow Left and Right AND the clickable area is available to switch the workspace. This may not be available on mobile mode, only in Desktop Mode.
[x] 1.8 When a file is opened in Focus Mode, and then the user clicks on "Files" in the magic menu, it stays with the Focused Modal of the opened file. It must always open the root folder by clicking on "Files" in the magic menu, and if any focused modal is opened it must be closed.
[x] 1.9 Opening a file from the Files View must also show all available widgets in the Focus Mode. Currently I only see the regular editor for "Data Collection" for example. Fix it.
[x] 1.10 Using the search must also search file names not only the content of files. Currently it looks like file names are not searched. Investigate and fix it.
[x] 1.11 In Desktop mode the clickable area and the arrow left/right icons should only appear on the Desktop view, not in any other view.
[x] 1.12 Knowledge Graph is not rendering properly, nothing is shown. Investigate and fix it.
[x] 1.13 Clicking on the "Add to Dashboard"" button in focus mode does not render the of each item properly. the text is not visible. by hovering it becomes visible. Make each item text visible (check text color)
[x] 1.14 If the knowledge graph is opened, clicking on the "Files" entry in the magic menu does not change the view. Investigate and fix it.
[x] 1.15 Mobile iOS Safari: theme color is not applied to the top bar - and on some views not to the bottom bar. Investigate deeply and fix it. Make sure it uses the current theme color. Check if there is any conflicting style or something else. It's a really bad ux currently because the app is dark, but the top and bottom bars are light.
[x] 1.16 Mobile Focus Modal: if the title is too long, it increases the width of the Modal. But the Modal must stay in the view port. Add text ellipsis to the title.
[x] 1.17 Mobile Focus Modal: The action buttons (zen mode, add to dashboard, ...) are shifted to the right, outside of the modal, not in the view port anymore. A different approach is needed for mobile views: put the actions below the title. So there will be three rows for the top bar of the focus modal: actions, title, content toggles. The actions in the first row should be aligned to the right. Make sure this is only applied to Mobile view!
[x] 1.18 Mobile: Swipe left/right may only work on the dashboard view! If a Focus Modal is opened, the swipe left/right should not work. Also not on all other views. Only on the dashboard view. Investigate and fix it.
[x] 1.19 RSS widget in focus mode: clicking on "Read Later" and "Read" breaks the view somehow, the view becomes empty. I observed this on mobile view. Investigate and fix it.
[x] 1.20 Budget widget: there is a special handling that needs to be applied - if there are multiple rows with the same name, account and category, only consider the latest one (use the date column for that). Fix it.
[x] 1.21 The search is currently only available with a shortcut which does not work on Mobile. Add a new entry to the Magic Menu for Search. Make sure it works on Mobile too.
[x] 1.22 Budget Widget:
- Focus Mode, Accounts tab: negative values (outcome) is not rendered, but render it the same way as bars, but with a red bar instead of white, so it's clearly an outcome. Use the positive value for the width of the bar.
- Calculate the whole balance (income - outcome (only latest values)) and render the balance on the main widget view (top right corner).

## 2. Widgets

### [x] 2.1 Budget Widget (new)

Context: packages/ui
Goal: Build the following feature into the package and add/adjust Stories for it.
Always consider:

- This feature must also be part of the Story in src/Layouts/Layouts.stories.tsx - the feature must be somehow included into "MainApp.tsx" so the client app just needs to parameterize the component.
- Make sure it sticks to the same design
- Never hard code anything into the component itself, data must be passed from the client (except: the Stories)
- Always think if it makes sense to first build a smaller component in the structures Atoms/Molecules/Organisms and then embed it into the MainApp
- All components must work perfectly on both: mobile and desktop.
- All components must implement everything around Accessibility (a11y)
- The general purpose is to build a widget view for Tiles with the given requirements. That means: if a curtain content with a given file extension is passed to the widget, it should be able to render multiple views:
  - one small widget view (if not in focus mode)
  - in focus mode: a widget view, the regular editor
- the view in the focus mode can be toggled, add a corresponding selector into the header of the focused tile
- if action buttons are added that change the content of a file, a callback function must be specified so the client can handle it

#### Budget Widget

file extension: .budget.csv
file content: csv, example:

START OF FILE
name;account;category;date;value
Gehalt Adam;bwbank:adam;earnings;2024-08-05;8000
END OF FILE

Categories are as follows defined:

```
export const CATEGORIES: Category[] = [
		{
			id: 'earnings',
			label: 'Earnings',
			priority: 1,
			type: 'in',
		},
		{
			id: 'transport',
			label: 'Transport',
			priority: 2,
			type: 'out',
		},
		{
			id: 'food',
			label: 'Food',
			priority: 1,
			type: 'out',
		},
		{
			id: 'pocket-money',
			label: 'Pocket Money',
			priority: 3,
			type: 'out',
		},
		{
			id: 'education',
			label: 'Education',
			priority: 1,
			type: 'out',
		},
		{
			id: 'entertainment',
			label: 'Entertainment',
			priority: 4,
			type: 'out',
		},
		{
			id: 'savings',
			label: 'Savings',
			priority: 4,
			type: 'out',
		},
		{
			id: 'hobby',
			label: 'Hobby',
			priority: 4,
			type: 'out',
		},
		{
			id: 'running-costs',
			label: 'Running Costs',
			priority: 1,
			type: 'out',
		},
		{
			id: 'insurance',
			label: 'Insurance',
			priority: 1,
			type: 'out',
		},
		{
			id: 'loan',
			label: 'Loan',
			priority: 1,
			type: 'out',
		},
		{
			id: 'tax',
			label: 'Tax',
			priority: 1,
			type: 'out',
		},
		{
			id: 'invest',
			label: 'Invest',
			priority: 4,
			type: 'out',
		},
		{
			id: 'other-income',
			label: 'Other (Income)',
			priority: 1,
			type: 'in',
		},
		{
			id: 'other-outcome',
			label: 'Other (Outcome)',
			priority: 1,
			type: 'out',
		},
	]
```

Semantics:
- name: name of the transaction
- account: account the transaction belongs to
- category: category of the transaction
- date: date of the transaction (iso format)
- value: value of the transaction (number)

##### Small widget view

- bar chart per category (cumulated)
- every bar is a different color

##### Focus mode

- one view with the small widget content
- one view with bar chart per account (cumulated)
- one view to add a new entry (row) to the csv
  - it must render all input fields automatically
  - dropdown for all available names and input for "name". if "name" is selected, the dropdown must be disabled. if dropdown is selected, the input must be disabled.
  - dropdown for all available accounts and input for "account". if "account" is selected, the dropdown must be disabled. if dropdown is selected, the input must be disabled.
  - dropdown for all available categories
  - input for "value" as a number input
- one view with the regular editor

### [x] 2.2 Data Collection Widget (existing)

- Add switcher for the widget in focus mode
- It should be able to switch between:
  - Current year (only data from current year is rendered)
  - Last year (only data from last year is rendered)
  - All years (data from all years is rendered) - this is also the default view

### [x] 2.3 Action log (new)

Context: packages/ui
Goal: Build the following feature into the package and add/adjust Stories for it.
Always consider:

- This feature must also be part of the Story in src/Layouts/Layouts.stories.tsx - the feature must be somehow included into "MainApp.tsx" so the client app just needs to parameterize the component.
- Make sure it sticks to the same design
- Never hard code anything into the component itself, data must be passed from the client (except: the Stories)
- Always think if it makes sense to first build a smaller component in the structures Atoms/Molecules/Organisms and then embed it into the MainApp
- All components must work perfectly on both: mobile and desktop.
- All components must implement everything around Accessibility (a11y)
- The general purpose is to build a widget view for Tiles with the given requirements. That means: if a curtain content with a given file extension is passed to the widget, it should be able to render multiple views:
  - one small widget view (if not in focus mode)
  - in focus mode: a widget view, the regular editor
- the view in the focus mode can be toggled, add a corresponding selector into the header of the focused tile
- if action buttons are added that change the content of a file, a callback function must be specified so the client can handle it

#### Budget Widget

file extension: .actionlog.md
file content: markdown, example:

START OF FILE
---
type: actionlog
created: 2025-03-19T18:19:59.792Z
description: Write down in simple words what happened. Use tags to categorize your actions.
abbreviations: -
---

# Action Log

- 2025-03-19 19:20:03 Flexible Spam Detection in Accounts by using Redis Cache. #accounts
END OF FILE

Semantics:
- frontmatter with basic information
- Constant flow of actions as markdown list
- Each list item must have a timestamp and a description
- Each list item can have tags

##### Small widget view

- show how many items are in the list
- show the last 5 items
- show when the last item was added

##### Focus mode

- one view with the small widget content
- one view to add a new entry
  - input for description
  - input for tags
  - timestamp will be set automatically
- one view with the regular editor

## 3. Smaller Features

### 3.1 PWA

[x] 3.1.1 Make sure the app can be installed as PWA. Configure everything accordigly. Use a plugin for vite.
[x] 3.1.2 In mobile safari (iOS) the top bar color must be adjusted to the theme color

### 3.2 Grid

[x] 3.2.1 Improve the grid view on Desktop mode. Currently if there are only 4 items, and the screen is big, all items are rendered in one row (4 columns). I'd like to have it the following way: try to make the Tiles always fit the whole view port on Desktop. 4 items result in a 2x2 grid, and the Tiles should be big enough to fill the whole screen. 3 items result in a 1x3 grid, and the Tiles should be big enough to fill the whole screen. 2 items result in a 1x2 grid, and the Tiles should be big enough to fill the whole screen. 1 item results in a 1x1 grid, and the Tile should be big enough to fill the whole screen.

### 3.3 Search

[x] 3.3.1 Implement search functionality to search files and actions. The command ctrl+k opens the menu. Users can search for all files. Use the github search api to search for files.
[x] 3.3.2 Add regular commands to the search menu as well. Currently it only searches for files and their contents. Add commands for all entries in the magic manu, and also to switch the repo and workspaces. Also consider all the names of available repos and workspaces. Examples:
- "Navigate to Files" opens the Files view
- "Create new File" opens the modal to create a new file
- "Change Repo" opens the modal to change the repo
- "Change Workspace" opens the modal to change the workspace
- "Switch to Repo ABC" switches to the repo ABC

### 3.4 Status Bar

[x] 3.4.1 There are useless information in the status bar at the right bottom corner. Remove "Tiles" and "Workspace". Make the entry "Grid" a dropdown to switch between "Auto" and "4 Columns" / "3 Columns" / "2 Columns" / "1 Column" view - but only on desktop mode. On mobile mode it should always be "Auto".

### 3.5 Quick Notes

[x] 3.5.1 Implement a quick notes feature. It should be a new file type called "quick-note". It should be a simple markdown file with a frontmatter (see example below). The new quick note gets an auto-generated file name that includes the current date and time. Example: "quicknote-2025-11-13-16:35:31.md". Frontmatter example:

---
type: generic
created: 2025-11-13T15:35:31.883Z
description: A generic markdown document template for general note-taking and documentation.
abbreviations: undefined
---

Add a new menu item to the magic menu to create a new quick note. The quick notes will be automatically stored in folder ".lifeos/quicknotes". After creating a new quick note, it should be opened in the editor (flow: oipen file view, navigate to the folder where it's stored, open file)

### 3.6 File management

[x] 3.6.1 It must be possible to delete files. The file tile in the file view should have a menu with a delete option. 
[x] 3.6.2 It must be possible to move files. The file tile in the file view should have a menu with a move option. For this the user should be able to select a target folder like in the new file creation modal.
[x] 3.6.3 It must be possible to rename files. The file tile in the file view should have a menu with a rename option. 

### 3.7 Design

[x] 3.7.1 Favicon: Add a matching favicon to the app.

### 3.8 Editor

[x] 3.8.1 Implement a Zen Mode for the editor. It should be possible to toggle it with a button and a keyboard shortcut. In Zen Mode the editor should be in full screen mode and most of the other UI elements are hidden. New user should be able to fully focus on writing the text.

### 3.9 Dashboard

[x] 3.9.1 It must be possible to add a file to the Dashboard, so the widget can be rendered. Since it is possible to have multiple workspaces, the user should be able to select a workspace where to put it. 

[x] 3.9.2 Add a new menu entry to the magic menu called "Settings". This will open a new view where the user can configure settings for the app. All settings are stored in the .lifeos/.dashboard.config.json file. The structure of the file is as follows:

- version: the version of the file
- dashboards: a list of dashboards - these are the workspaces
- entries: a list of entries
- files: a list of files

On the settings page the user should be able to:
- add a new dashboard (workspace)
- delete a dashboard (workspace)
- rename a dashboard (workspace)
- change the order of the dashboards

The version field is for backward compatibility. So make sure that there is a migration path to the next version.

{
  "version": 1,
  "dashboards": [
    {
      "id": "d0",
      "name": "work8test-new"
    },
    {
      "id": "d1",
      "name": "new-dashboard"
    },
    {
      "id": "d2",
      "name": "default"
    },
    {
      "id": "d3",
      "name": "my new shiny dashboard"
    }
  ],
  "entries": [
    {
      "path": "my2.achievements.md",
      "dashboard": "d1",
      "skipOnMobile": false
    },
    {
      "path": "generic-test/generic-other.csv.md",
      "dashboard": "d3",
      "skipOnMobile": false
    },
    {
      "path": "test-todos.todos.md",
      "dashboard": "d2",
      "skipOnMobile": false
    },
    {
      "path": "reditlater.readitlater.json",
      "dashboard": "d2",
      "skipOnMobile": false
    },
    {
      "path": ".lifeos/.readitlater.json",
      "dashboard": "d0",
      "skipOnMobile": false
    },
    {
      "path": "test2.habit.csv",
      "dashboard": "d0",
      "skipOnMobile": false
    },
    {
      "path": "my-date-time.timezones.json",
      "dashboard": "d0",
      "skipOnMobile": false
    }
  ],
  "files": {
    "selected": "0_event.events.csv",
    "opened": [
      "0_event.events.csv"
    ],
    "recentlyOpened": [
      "hackernews.rss.json",
      "asd.md",
      ".lifeos/quicknotes/quicknote-2026-02-03-10:38:15.md",
      "0_event.events.csv",
      "my-lifosy-event.lifosy-event.json",
      "testidea .tldraw.json",
      ".lifeos/.readitlater.json",
      ".lifeos/quicknotes/quicknote-2025-11-07-12:59.md",
      "hello-quicknote.md",
      ".lifeos/quicknotes/quicknote-2025-11-07-12:57.md"
    ]
  }
}

### 3.10 Routing

[x] 3.10.1 For all main views add dedicated routes so it's easier to navigate to them. Root is always the Dashboard View. "/files" navigates to the Files View. "/files/new" opens the new file modal. "/files/[path in repo]" opens the files view or the file in the editor with the path from the parameter - if the path is not valid, or the file is not found, navigate to the files view.

### 3.11 Graph

[x] 3.11.1 Implement a view that represents how files are connected to each other. Consider only Markdown files where files can be referenced with a link. The graph should be interactive and allow to navigate to the referenced files. For details read the Obsidian docs, the graph should do the same as the Obsidian graph view: https://help.obsidian.md/plugins/graph. Add this as a new entry to the magic menu. Show connections between files in the graph view.

### 3.12 Commits

[x] 3.12.1 Implement a view that shows the commit history for the current repo. It can be very just a table showing the commits with the commit message, the author, the date and the commit hash. Add this as a new entry to the magic menu.

### 3.13 File history

[x] 3.13.1 Implement a view that shows the history of a specific file. For each Focused Modal show a new toggle "History" that opens this view. In this view the user can see the history of the file and what changes were made in each commit.

### 3.14 Table view for csv files

[x] 3.14.1 Implement a table view for csv files. For each Focused Modal show a new toggle "Table" that opens this view. In this view the user can see the table of the csv file. It should be possible to sort the columns by clicking on the column headers. It should also be possible to filter the rows by clicking on the filter icon in the column header. This will be applied to all files with the extension .csv

### 3.15 Logging

[x] 3.15.1 Create a custom logger for the app. Eventually there may not be any console.log calls in the code. The logger should be able to log to the console. The logger should be able to log different levels of messages (debug, info, warn, error). The logger should be able to log different modules (ui, backend, etc.). Make sure that in production no warnings and errors are logged to the console.

### 3.16 New route with new file

[x] 3.16.1 Add a new route "/new" that opens the new file modal. This route should be added to the router. Nothing happens so far, but it can be used to quickly put data into it. If the user uses the shortcut ctrl+s or clicks on save, a save dialog opens and the user can select the name and the location of the file. The modal to save the file should look like the new file modal, but it should be possible to select a parent folder and a file name. Preselect the quicknotes folder and a file name based on the current date and time (like the quicknote files). Also updated Console App to support /new route. Fixed UI issue where workspace navigation arrows were visible in Dump View. Fixed issue where navigating away from Dump View was not working.