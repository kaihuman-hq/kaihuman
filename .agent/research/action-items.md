# Action Items

## 1. Bugs

[x] 1.1 From the status bar, clicking on one recent file, currently does not open the file properly. Implement the following: open the files view and navigate to the folder where file is located and open the file.
[x] 1.2 Fix repo selection to open the newly selected repo instead of the default one.
[x] 1.3 Files that have been saved must also be considered in the recently opened files list in .lifosy directory. Fix it. Make sure there is a limit of 10 files.

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
