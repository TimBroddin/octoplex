# muxi — Terminal Multiplexer TUI

**Date**: 2026-02-28
**Status**: Approved
**npm package**: `muxi`

## Problem

Developers running multiple processes during local development (dev server, CSS watcher, test runner, log tailing, etc.) need many terminal windows or tabs. Existing solutions are either framework-specific (Solo for Laravel) or heavyweight (tmux). We want a lightweight, framework-agnostic TUI multiplexer built with Bun and Ink.

## Decisions

- **Framework-agnostic** with optional JS/TS project extras (package.json script detection)
- **Ink + Bun.Terminal**: React-based TUI rendering with Bun's built-in PTY API (node-pty doesn't work with Bun)
- **Config**: `.muxi.json` (simple) and `.muxi.ts` (advanced) both supported
- **Distribution**: Works as global CLI (`bun add -g muxi`) or local dev dependency (`bunx muxi`)
- **MVP features**: Tabs, autostart/lazy commands, scrollable output, interactive mode, log tailing

## Architecture

```
┌─────────────────────────────────────────────┐
│  muxi CLI (bin/muxi.ts)                     │
│  - Parses args, loads config                │
│  - Renders Ink <App /> component            │
├─────────────────────────────────────────────┤
│  <App />                                    │
│  ├── <TabBar />        ← tab names + status │
│  ├── <OutputPane />    ← scrollable output  │
│  │   └── ANSI-rendered PTY output           │
│  ├── <HotkeyBar />     ← available actions  │
│  └── <LogTailPane />   ← special log viewer │
├─────────────────────────────────────────────┤
│  ProcessManager                             │
│  - Spawns/kills processes via Bun.Terminal   │
│  - Manages lifecycle per tab                │
│  - Buffers output with max line limit       │
├─────────────────────────────────────────────┤
│  ConfigLoader                               │
│  - Reads .muxi.json or .muxi.ts            │
│  - Validates config schema                  │
│  - Detects package.json scripts (JS extra)  │
└─────────────────────────────────────────────┘
```

### Key modules

- **CLI entry point** (`bin/muxi.ts`) — arg parsing, config loading, Ink render
- **ProcessManager** (`src/process.ts`) — wraps `Bun.Terminal`, manages spawn/kill/restart per command
- **React components** — TabBar, OutputPane, HotkeyBar, LogTailPane
- **ConfigLoader** (`src/config.ts`) — reads `.muxi.json` / `.muxi.ts`, validates, merges defaults

## Config Format

### .muxi.json

```json
{
  "commands": {
    "Dev Server": {
      "cmd": "bun run dev",
      "autostart": true,
      "cwd": ".",
      "env": { "PORT": "3000" }
    },
    "Tailwind": {
      "cmd": "bunx tailwindcss -w",
      "autostart": true
    },
    "Tests": {
      "cmd": "bun test --watch",
      "autostart": false
    },
    "Logs": {
      "cmd": "tail -f /var/log/app.log",
      "autostart": true,
      "type": "log"
    }
  }
}
```

### .muxi.ts (advanced)

```ts
import { defineConfig } from "muxi";

export default defineConfig({
  commands: {
    "Dev Server": {
      cmd: "bun run dev",
      autostart: true,
      env: { PORT: process.env.PORT || "3000" },
    },
    Tests: {
      cmd: "bun test --watch",
      autostart: false,
    },
  },
});
```

### JS extra

If no config file exists, muxi can auto-detect `package.json` scripts and offer to generate a `.muxi.json`.

## Process Lifecycle

```
States: idle → starting → running → stopping → stopped
                                   ↗ (error)
                          running → errored

User actions:
  s → start (idle/stopped/errored → starting → running)
  s → stop  (running → stopping → stopped)
  r → restart (running → stopping → starting → running)
  c → clear output buffer
```

- **autostart: true** — process spawns immediately on launch
- **autostart: false** — tab visible but shows "Press [s] to start"
- Processes spawned via `Bun.Terminal` in PTY mode
- Output buffered per-tab (configurable max lines, default 10,000)
- On exit: SIGTERM → wait 3s → SIGKILL to all processes

## UI Layout

```
┌──────────────────────────────────────────────┐
│ [Dev Server] [Tailwind] [Tests] [Logs]       │  ← TabBar
├──────────────────────────────────────────────┤
│                                              │
│  $ bun run dev                               │
│  Server listening on http://localhost:3000   │
│  GET / 200 in 12ms                           │  ← OutputPane
│  GET /api/users 200 in 45ms                  │     (scrollable)
│  ...                                         │
│                                              │
├──────────────────────────────────────────────┤
│ [s]top [r]estart [c]lear [p]ause ←→ tabs    │  ← HotkeyBar
│ [i]nteractive [q]uit  ↑↓ scroll             │
└──────────────────────────────────────────────┘
```

### Hotkeys

| Key | Action |
|-----|--------|
| `←` / `→` | Switch tabs |
| `1-9` | Jump to tab by number |
| `s` | Start/Stop process |
| `r` | Restart process |
| `c` | Clear output |
| `p` / `f` | Pause / Follow output |
| `↑` / `↓` | Scroll output |
| `i` | Interactive mode (send input to process) |
| `Ctrl+X` | Exit interactive mode |
| `q` / `Ctrl+C` | Quit muxi |

## Log Tailing Mode

When a command has `"type": "log"`, the OutputPane switches to a log-aware viewer:

- Detects common log formats (JSON logs, timestamp-prefixed)
- Colorizes log levels (ERROR=red, WARN=yellow, INFO=blue, DEBUG=gray)
- `w` to toggle line wrapping
- `t` to truncate/clear the log file

## Project Structure

```
muxi/
├── package.json
├── tsconfig.json
├── bin/
│   └── muxi.ts           ← CLI entry point
├── src/
│   ├── app.tsx            ← Root <App /> component
│   ├── config.ts          ← ConfigLoader
│   ├── process.ts         ← ProcessManager (node-pty wrapper)
│   ├── types.ts           ← Shared types
│   ├── components/
│   │   ├── TabBar.tsx
│   │   ├── OutputPane.tsx
│   │   ├── HotkeyBar.tsx
│   │   └── LogTailPane.tsx
│   └── hooks/
│       ├── useProcess.ts
│       ├── useKeyboard.ts
│       └── useScrollback.ts
└── .muxi.json             ← Example config
```

## Technology Stack

- **Runtime**: Bun
- **TUI framework**: Ink (React for CLI)
- **Process management**: Bun.Terminal (built-in PTY API, no native deps)
- **Config**: JSON + TypeScript config files
- **Language**: TypeScript

## Out of Scope (future)

- Themes/color customization
- Desktop notifications
- Search within output
- Plugin system
- Windows support
