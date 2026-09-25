# TodoDesk

TodoDesk is a desktop todo application. It runs as a native window on Windows, macOS, and Linux. Tasks are stored on your computer, not in the cloud.

You can create, edit, complete, search, filter, and sort tasks. Each task can have a priority, due date, description, and tags. The app also includes an overview, a clipboard history manager, a Markdown editor with live preview, a local AI assistant, settings, light/dark theme, and a custom title bar (minimize, maximize, close).

This README is written for beginners. You do not need prior Electron experience to follow the setup steps.

---

## What this project uses

| Piece                  | Role                                                             |
| ---------------------- | ---------------------------------------------------------------- |
| **Electron**           | Turns the web UI into a desktop app (window, menus, local files) |
| **React + TypeScript** | The user interface                                               |
| **Vite**               | Fast development server and production bundler for the UI        |
| **Tailwind CSS**       | Styling                                                          |
| **sql.js (SQLite)**    | Local database stored as a file on disk                          |
| **react-markdown**     | Live Markdown preview (GFM + line breaks)                        |
| **IPC + preload**      | Safe communication between the UI and the desktop/main process   |

Important security rule: the React UI **cannot** talk to the file system or database directly. Only the Electron main process can. The UI asks for data through a small, explicit API.

---

## Requirements

Install these before you start:

1. **[Node.js](https://nodejs.org/)** 20 or newer (includes `npm`)
2. **npm** (comes with Node.js)
3. Git (optional, only if you clone the repository)

Check that they work:

```bash
node -v
npm -v
```

On Windows, use **PowerShell** or **Command Prompt** in the project folder.

---

## Installation

1. Open a terminal in the project folder:

```bash
cd path/to/app
```

2. Install dependencies:

```bash
npm install
```

This downloads Electron, React, Vite, and the other packages into `node_modules/`.

If `npm install` finishes but `electron.exe` is missing (some npm setups skip install scripts), approve Electron’s installer and run install again:

```bash
npm install-scripts approve electron esbuild electron-winstaller
npm install
```

---

## Development setup

Start the app in development mode:

```bash
npm run dev
```

What this does:

1. Vite starts the React UI at `http://127.0.0.1:5173`
2. A helper script waits until that server is ready
3. Electron opens the TodoDesk window and loads the UI

Leave the terminal open while you work. If you change React files, the window updates automatically (hot reload).

### Useful scripts

| Command              | What it does                                              |
| -------------------- | --------------------------------------------------------- |
| `npm run dev`        | Run the desktop app for development                       |
| `npm run build`      | Type-check TypeScript and build the UI for production     |
| `npm run test:db`    | Run a small SQLite create/read/update/delete smoke test   |
| `npm run dist`       | Build the UI and package an installer for your current OS |
| `npm run dist:win`   | Package a Windows `.exe` installer                        |
| `npm run dist:mac`   | Package a macOS `.dmg`                                    |
| `npm run dist:linux` | Package a Linux AppImage                                  |

Stop the app with `Ctrl+C` in the terminal, or close the TodoDesk window.

---

## Usage

### First launch

When the window opens you will see:

- A **custom title bar** (minimize, maximize/restore, close)
- A **sidebar** with Todo, Clipboard, Markdown, Assistant, and Settings
- A **New Task** button
- **Todo tabs** on the Todo page (Overview, All Tasks, Today, Upcoming, Completed, High Priority)

Tasks, clipboard history, and saved Markdown documents persist after you close and reopen the app.

### Create a task

1. Click **New Task** (or press `Ctrl+N` / `Cmd+N`)
2. Enter a **title** (required)
3. Optionally add a description, priority, due date, and tags
4. Click **Create task**

Empty titles are rejected. Tags: type a word and press Enter.

### Edit, complete, or delete

Each task card has:

- A checkbox to mark it complete / incomplete
- An edit button
- A delete button

Completed tasks look visually distinct (muted + strikethrough).

If **Confirm before deleting tasks** is enabled in Settings, delete asks for confirmation first.

### Search, filter, and sort

On task pages you can:

- **Search** by title, description, or tags (`Ctrl+F` / `Cmd+F`)
- **Filter:** All, Pending, Completed, High / Medium / Low Priority, Overdue
- **Sort:** Newest, Oldest, Due Date, Priority, Alphabetical

### Todo tabs

Click **Todo** in the sidebar. The page uses tabs for the old sidebar views:

| Tab           | Shows                                             |
| ------------- | ------------------------------------------------- |
| Overview      | Counts plus Today, Upcoming, and Recently created |
| All Tasks     | Every task                                        |
| Today         | Incomplete tasks due today                        |
| Upcoming      | Incomplete tasks due after today                  |
| Completed     | Finished tasks                                    |
| High Priority | Incomplete high-priority tasks                    |

The active tab is underlined. Returning from Clipboard, Markdown, or Settings keeps your last Todo tab.

### Clipboard

Click **Clipboard** in the sidebar. TodoDesk watches the system clipboard and saves new copied text locally.

- Identical text is stored once; the use count goes up instead
- Click a card to copy that text again (this also increases the count, without adding a duplicate)
- Pin / unpin items; delete removes an item immediately (no confirmation)
- Search filters clipboard content

**Filter / sort bar** (under search):

| Control  | Behavior                            |
| -------- | ----------------------------------- |
| **All**  | Show every clipboard item (default) |
| **Pin**  | Show only pinned items              |
| **Sort** | Last Copied ↓ / ↑, Copy Count ↓ / ↑ |

Default state when the page opens:

- **All** is selected
- Sort is **Last Copied ↓** (`last_copied_at` newest first)

So the most recently copied item appears at the top. After **Copy Again**, that item moves to the top when using the default sort. Sorting only changes the display order; it does not rewrite database rows.

Copying from inside TodoDesk (**click a card**) does not create a second history row.

### Markdown

Click **Markdown** in the sidebar for a live Markdown editor.

- Split layout by default: **Editor** on the left, **Preview** on the right
- On smaller screens, use the **Edit / Preview** tabs to switch panes
- Actions: **Saved list**, **Copy**, **Clear**, **Save**
- Preview supports headings, bold/italic, links, lists, blockquotes, code, tables, and more (`react-markdown` + GFM)

**Save**

- Saves the current content into the local SQLite database
- Title is taken from the first heading or first line of text
- Saving the same content again updates the existing document instead of creating a duplicate
- Opening a saved item and saving again updates that document

**Saved list**

- Opens a clipboard-style list of saved documents
- Each card shows title, snippet, updated time, **Edit**, and **Delete**
- **Edit** loads the document into the editor
- **Back to editor** returns to the split view

### Assistant

Click **Assistant** in the sidebar to chat with a local model through [Ollama](https://ollama.com/).

Conversations and messages are stored in the local sql.js database (`ai_conversations`, `ai_messages`). They survive page changes, reloads, and app restarts.

The renderer never calls Ollama or the database directly. The flow is:

```text
Assistant page → preload aiAPI → IPC → AI service → repository + Ollama
```

```text
User message → save → load history → Ollama (/api/chat) → save assistant reply
```

Model: `llama3.2`.

Before chatting:

```bash
ollama serve
ollama pull llama3.2
```

Then open Assistant:

- **New Chat** creates a conversation (title updates from the first user message)
- Selecting a conversation loads its messages from the database
- Delete removes the conversation and its messages
- If Ollama fails after the user message is saved, the message stays and **Retry** regenerates the reply

If Ollama is stopped, or the model is missing, the page shows a short error instead of a stack trace.

### Keyboard shortcuts

| Shortcut           | Action                         |
| ------------------ | ------------------------------ |
| `Ctrl+N` / `Cmd+N` | New task                       |
| `Ctrl+F` / `Cmd+F` | Focus search                   |
| `Esc`              | Close the open modal or dialog |

### Settings

- **Theme:** Light, Dark, or System
- **Confirm before deleting tasks** (task delete only; clipboard and Markdown delete are instant)
- **Clear completed** or **Clear all tasks** (both ask for confirmation)
- App name, version, and storage location

---

## Architecture

TodoDesk is split into two sides:

```text
Electron main process          (Node.js: window, files, SQLite)
        ↓
Preload script                 (contextBridge — the only bridge)
        ↓
Secure APIs                    window.todoAPI / settingsAPI / clipboardAPI / markdownAPI / aiAPI / windowAPI
        ↓
React renderer                 (the UI you see)
```

The renderer runs with:

- `contextIsolation: true`
- `nodeIntegration: false`

That means React cannot use Node.js APIs. It must call the methods exposed in `electron/preload.cjs`.

### Data flow for a typical action

Example: creating a task

1. You submit the form in React
2. `todoService.create()` calls `window.todoAPI.createTodo(...)`
3. The preload script sends an IPC message (`todos:create`)
4. The main process validates the input and writes to SQLite
5. The result is returned to React
6. React refreshes the list from the database

The database is the source of truth. React state is only the current UI snapshot.

### Project structure

```text
app/
├── electron/                 # Desktop / main process
│   ├── main.js               # Window, security, app lifecycle, clipboard watcher start/stop
│   ├── preload.cjs           # Exposes todoAPI, settingsAPI, clipboardAPI, markdownAPI, aiAPI, windowAPI
│   ├── clipboardWatcher.js   # Polls OS clipboard; ignores TodoDesk “copy again”
│   ├── ai/
│   │   ├── ollamaClient.js   # Local Ollama chat (llama3.2)
│   │   └── aiService.js      # Persist messages + call Ollama
│   ├── windowState.js        # Remembers window size and position
│   ├── ipc/
│   │   └── register.js       # IPC handlers (errors wrapped, never swallowed)
│   └── database/
│       ├── connection.js     # Open / save the SQLite file
│       ├── migrations.js     # Schema versioning
│       ├── todoRepository.js
│       ├── todoValidation.js
│       ├── clipboardRepository.js
│       ├── markdownRepository.js
│       ├── aiRepository.js   # AI conversations / messages
│       └── settingsRepository.js
├── src/                      # React UI (renderer)
│   ├── components/           # Cards, modal, dialogs, tabs, clipboard filter bar
│   ├── pages/                # Todo, Clipboard, Markdown, Assistant, Settings
│   ├── layouts/              # Title bar, sidebar, app shell
│   ├── hooks/
│   ├── services/             # Calls the preload APIs (no DB code here)
│   ├── store/                # React context for todos, clipboard, and settings
│   ├── utils/
│   ├── types/
│   ├── App.tsx
│   └── main.tsx
├── scripts/
│   ├── dev-electron.mjs      # Waits for Vite, then launches Electron
│   ├── smoke-db.mjs          # SQLite CRUD + clipboard + markdown + AI smoke tests
│   └── inspect-db.mjs        # Print tables from the live database file
├── public/
├── build/icon.png
├── index.html
├── vite.config.ts
├── tailwind.config.js
└── package.json
```

### Preload API (what React is allowed to call)

```javascript
window.todoAPI.getTodos();
window.todoAPI.createTodo(todo);
window.todoAPI.updateTodo(id, todo);
window.todoAPI.deleteTodo(id);
window.todoAPI.toggleTodo(id);
window.todoAPI.clearCompleted();
window.todoAPI.clearAll();
window.todoAPI.getStats();

window.settingsAPI.getSettings();
window.settingsAPI.updateSettings(patch);

window.clipboardAPI.getItems();
window.clipboardAPI.copyAgain(id);
window.clipboardAPI.deleteItem(id);
window.clipboardAPI.togglePin(id);

window.markdownAPI.getDocuments();
window.markdownAPI.saveDocument({ id, content });
window.markdownAPI.deleteDocument(id);

window.aiAPI.getStatus();
window.aiAPI.chat(messages);

window.windowAPI.minimize();
window.windowAPI.maximize();
window.windowAPI.close();
```

---

## Database

TodoDesk uses **SQLite** through [sql.js](https://sql.js.org/). The database lives in a file on disk. Closing the app does not delete your data.

### Where the file is stored

The file name is `tododesk.sqlite` inside Electron’s user-data folder:

| OS      | Typical location                                          |
| ------- | --------------------------------------------------------- |
| Windows | `C:\Users\<you>\AppData\Roaming\TodoDesk\tododesk.sqlite` |
| macOS   | `~/Library/Application Support/TodoDesk/tododesk.sqlite`  |
| Linux   | `~/.config/TodoDesk/tododesk.sqlite`                      |

Window size and position are stored next to it in `window-state.json`.

### Todo fields

Each row in `todos` matches this shape:

```text
id            unique id
title         required
description   optional notes
completed     true / false
priority      low | medium | high
dueDate       ISO date string or empty
tags          JSON array of strings
createdAt     ISO timestamp
updatedAt     ISO timestamp
```

Settings (theme, confirm-before-delete) are stored in a separate `settings` table.

### Clipboard tables

```text
clipboard_items
  id, content (unique), is_pinned, created_at, updated_at

clipboard_usage
  id, clipboard_item_id, copy_count, last_copied_at
```

Copying the same text again increments `copy_count` and updates `last_copied_at`. It does not insert another `clipboard_items` row.

### Markdown documents

```text
markdown_documents
  id, title, content, created_at, updated_at
```

Saving Markdown uses an auto-generated title (first heading or first line). Duplicate identical content updates the existing row instead of inserting a new one.

### How writes work

1. The main process keeps SQLite in memory (sql.js)
2. After a change, it writes the full database file back to disk
3. On the next launch, that file is loaded again

Schema changes go through `electron/database/migrations.js` so existing installs can upgrade safely.

Current migrations:

1. Todos + settings
2. Clipboard history
3. Markdown documents
4. AI conversations + messages

### Inspect or test the database

```bash
npm run test:db
```

To print the live app database (migrations, settings, todos, clipboard, markdown, AI):

```bash
node scripts/inspect-db.mjs
```

Do this while you are debugging. Avoid editing the `.sqlite` file by hand while the app is open; the running app may overwrite it.

---

## Production build

### 1. Build the UI

```bash
npm run build
```

This type-checks the React/TypeScript code and writes the bundled UI to `dist/`.

### 2. Package a desktop installer

For the OS you are currently using:

```bash
npm run dist
```

Or target one platform:

```bash
npm run dist:win     # Windows NSIS installer (.exe)
npm run dist:mac     # macOS disk image (.dmg)
npm run dist:linux   # Linux AppImage
```

Installers are written to the `release/` folder.

**Notes for packaging**

- Packaging for macOS from Windows (or the reverse) is limited. Build on the OS you want to ship, when possible.
- The Windows installer is NSIS: you can choose the install folder and get Start Menu / desktop shortcuts.
- `sql.js` is a normal JavaScript dependency (no native compiler needed), which keeps packaging simpler than `better-sqlite3`.

### 3. Install and run the packaged app

After `npm run dist:win`, run the installer from `release/`. The installed app works **offline** and does not need `npm run dev`.

---

## Troubleshooting

**`npm run dev` opens Vite but no window**  
Wait a few seconds. Electron starts only after `http://127.0.0.1:5173` responds. If it still fails, stop the terminal with `Ctrl+C` and run `npm run dev` again.

**Electron binary missing**  
Approve install scripts (see [Installation](#installation)) and run `npm install` again.

**Tasks / clipboard / Markdown disappeared**  
They are stored in the user-data folder above, not in the project directory. Clearing that folder (or using another Windows user account) looks like an empty app.

**Port 5173 already in use**  
Another Vite process is still running (often from a previous `npm run dev` that was not stopped). Close that terminal with `Ctrl+C`, or end the Node process using port 5173, then start `npm run dev` again. Vite is configured to use port `5173` only.

**UI looks like a website in the browser**  
Open the **Electron window**, not a tab at `http://127.0.0.1:5173`. The browser tab does not have `window.todoAPI`, `window.clipboardAPI`, or `window.markdownAPI`, so saving data will fail there.

---

## License

MIT
