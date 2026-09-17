# TodoDesk

TodoDesk is a desktop todo application. It runs as a native window on Windows, macOS, and Linux. Tasks are stored on your computer, not in the cloud.

You can create, edit, complete, search, filter, and sort tasks. Each task can have a priority, due date, description, and tags. The app also includes a dashboard, settings, light/dark theme, and a custom title bar (minimize, maximize, close).

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
- A **sidebar** with Dashboard, task views, and Settings
- A **New Task** button

Tasks persist after you close and reopen the app.

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

### Sidebar views

| View          | Shows                                             |
| ------------- | ------------------------------------------------- |
| Dashboard     | Counts plus Today, Upcoming, and Recently created |
| All Tasks     | Every task                                        |
| Today         | Incomplete tasks due today                        |
| Upcoming      | Incomplete tasks due after today                  |
| Completed     | Finished tasks                                    |
| High Priority | Incomplete high-priority tasks                    |
| Settings      | Theme, safety, and data tools                     |

### Keyboard shortcuts

| Shortcut           | Action                         |
| ------------------ | ------------------------------ |
| `Ctrl+N` / `Cmd+N` | New task                       |
| `Ctrl+F` / `Cmd+F` | Focus search                   |
| `Esc`              | Close the open modal or dialog |

### Settings

- **Theme:** Light, Dark, or System
- **Confirm before deleting tasks**
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
Secure APIs                    window.todoAPI / settingsAPI / windowAPI
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
│   ├── main.js               # Window, security, app lifecycle
│   ├── preload.cjs           # Exposes window.todoAPI, settingsAPI, windowAPI
│   ├── windowState.js        # Remembers window size and position
│   ├── ipc/
│   │   └── register.js       # IPC handlers (errors wrapped, never swallowed)
│   └── database/
│       ├── connection.js     # Open / save the SQLite file
│       ├── migrations.js     # Schema versioning
│       ├── todoRepository.js # Todo queries
│       ├── todoValidation.js # Server-side validation
│       └── settingsRepository.js
├── src/                      # React UI (renderer)
│   ├── components/           # Reusable UI (cards, modal, dialogs)
│   ├── pages/                # Dashboard, Tasks, Settings
│   ├── layouts/              # Title bar, sidebar, app shell
│   ├── hooks/
│   ├── services/             # Calls the preload APIs (no DB code here)
│   ├── store/                # React context for todos and settings
│   ├── utils/                # Dates, filters, validation helpers
│   ├── types/
│   ├── App.tsx
│   └── main.tsx
├── scripts/
│   ├── dev-electron.mjs      # Waits for Vite, then launches Electron
│   ├── smoke-db.mjs          # SQLite CRUD smoke test
│   └── inspect-db.mjs        # Print tables from the live database file
├── public/                   # Static files copied into the UI build
├── build/icon.png            # Installer / app icon
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

window.windowAPI.minimize();
window.windowAPI.maximize();
window.windowAPI.close();
```

---

## Database

TodoDesk uses **SQLite** through [sql.js](https://sql.js.org/). The database lives in a file on disk. Closing the app does not delete your tasks.

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

### How writes work

1. The main process keeps SQLite in memory (sql.js)
2. After a change, it writes the full database file back to disk
3. On the next launch, that file is loaded again

Schema changes go through `electron/database/migrations.js` so existing installs can upgrade safely.

### Inspect or test the database

```bash
npm run test:db
```

To print the live app database (migrations, settings, todos):

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

**Tasks disappeared**  
They are stored in the user-data folder above, not in the project directory. Clearing that folder (or using another Windows user account) looks like an empty app.

**Port 5173 already in use**  
Stop the other Vite/Electron process, then start `npm run dev` again. Vite is configured to use port `5173` only.

**UI looks like a website in the browser**  
Open the **Electron window**, not a tab at `http://127.0.0.1:5173`. The browser tab does not have `window.todoAPI`, so saving tasks will fail there.

---

## License

MIT
