# muxi Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a terminal multiplexer TUI (`muxi`) that runs multiple commands in tabs, configured via `.muxi.json` or `.muxi.ts`, with scrollable output, interactive mode, and log tailing.

**Architecture:** Ink (React for CLI) renders a fullscreen tabbed UI. Each tab manages a process spawned via `Bun.Terminal` (Bun's built-in PTY API — node-pty doesn't work with Bun). A ProcessManager class handles spawn/kill/restart lifecycle. ConfigLoader reads `.muxi.json` or `.muxi.ts` files.

**Tech Stack:** Bun, Ink 6.x, React 18, ink-tab 5.2.x, Bun.Terminal API, TypeScript

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `bin/muxi.ts`
- Create: `src/types.ts`

**Step 1: Initialize Bun project**

Run: `cd /Users/timbroddin/Projects/multi && bun init -y`

**Step 2: Install dependencies**

Run: `bun install ink react ink-tab && bun install -d @types/react`

**Step 3: Update package.json**

Edit `package.json` to set:
```json
{
  "name": "muxi",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "muxi": "./bin/muxi.ts"
  },
  "files": ["bin", "src"],
  "dependencies": {
    "ink": "^6.8.0",
    "ink-tab": "^5.2.0",
    "react": "^18.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.0.0"
  }
}
```

**Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "strict": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ESNext",
    "outDir": "./dist",
    "rootDir": ".",
    "declaration": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*", "bin/**/*"]
}
```

**Step 5: Create src/types.ts**

```ts
export type ProcessStatus = "idle" | "starting" | "running" | "stopping" | "stopped" | "errored";

export interface CommandConfig {
  cmd: string;
  autostart?: boolean; // default true
  cwd?: string;
  env?: Record<string, string>;
  type?: "default" | "log";
}

export interface MuxiConfig {
  commands: Record<string, CommandConfig | string>;
}

export interface TabState {
  name: string;
  config: CommandConfig;
  status: ProcessStatus;
  output: string[];
  scrollOffset: number;
  following: boolean;
}

export function defineConfig(config: MuxiConfig): MuxiConfig {
  return config;
}
```

**Step 6: Create bin/muxi.ts (minimal entry point)**

```ts
#!/usr/bin/env bun
import React from "react";
import { render, Box, Text } from "ink";

function App() {
  return (
    <Box>
      <Text bold color="cyan">muxi</Text>
      <Text> - terminal multiplexer</Text>
    </Box>
  );
}

render(React.createElement(App));
```

**Step 7: Verify it runs**

Run: `bun bin/muxi.ts`
Expected: Prints "muxi - terminal multiplexer" and exits.

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold muxi project with Ink and types"
```

---

### Task 2: Config Loader

**Files:**
- Create: `src/config.ts`
- Create: `src/config.test.ts`

**Step 1: Write the test**

```ts
import { test, expect, beforeEach, afterEach } from "bun:test";
import { loadConfig, normalizeCommand } from "../src/config";
import { join } from "path";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "muxi-test-"));
});

afterEach(async () => {
  await rm(testDir, { recursive: true });
});

test("normalizeCommand: string becomes CommandConfig", () => {
  const result = normalizeCommand("bun run dev");
  expect(result).toEqual({
    cmd: "bun run dev",
    autostart: true,
    type: "default",
  });
});

test("normalizeCommand: object with defaults", () => {
  const result = normalizeCommand({ cmd: "bun test", autostart: false });
  expect(result).toEqual({
    cmd: "bun test",
    autostart: false,
    type: "default",
  });
});

test("loadConfig: reads .muxi.json", async () => {
  await Bun.write(
    join(testDir, ".muxi.json"),
    JSON.stringify({
      commands: {
        "Dev": "bun run dev",
        "Test": { cmd: "bun test", autostart: false },
      },
    })
  );
  const config = await loadConfig(testDir);
  expect(Object.keys(config.commands)).toEqual(["Dev", "Test"]);
  expect(config.commands["Dev"].cmd).toBe("bun run dev");
  expect(config.commands["Dev"].autostart).toBe(true);
  expect(config.commands["Test"].autostart).toBe(false);
});

test("loadConfig: reads .muxi.ts", async () => {
  await Bun.write(
    join(testDir, ".muxi.ts"),
    `export default { commands: { "Server": "bun run start" } };`
  );
  const config = await loadConfig(testDir);
  expect(config.commands["Server"].cmd).toBe("bun run start");
});

test("loadConfig: throws when no config found", async () => {
  expect(loadConfig(testDir)).rejects.toThrow("No .muxi.json or .muxi.ts found");
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/config.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement config loader**

Create `src/config.ts`:
```ts
import { join } from "path";
import type { CommandConfig, MuxiConfig } from "./types";

export interface NormalizedConfig {
  commands: Record<string, CommandConfig>;
}

export function normalizeCommand(input: CommandConfig | string): CommandConfig {
  if (typeof input === "string") {
    return { cmd: input, autostart: true, type: "default" };
  }
  return {
    cmd: input.cmd,
    autostart: input.autostart ?? true,
    cwd: input.cwd,
    env: input.env,
    type: input.type ?? "default",
  };
}

export async function loadConfig(dir: string): Promise<NormalizedConfig> {
  const jsonPath = join(dir, ".muxi.json");
  const tsPath = join(dir, ".muxi.ts");

  let raw: MuxiConfig | null = null;

  const jsonFile = Bun.file(jsonPath);
  if (await jsonFile.exists()) {
    raw = await jsonFile.json();
  } else {
    const tsFile = Bun.file(tsPath);
    if (await tsFile.exists()) {
      const mod = await import(tsPath);
      raw = mod.default;
    }
  }

  if (!raw) {
    throw new Error("No .muxi.json or .muxi.ts found in " + dir);
  }

  const commands: Record<string, CommandConfig> = {};
  for (const [name, value] of Object.entries(raw.commands)) {
    commands[name] = normalizeCommand(value);
  }

  return { commands };
}
```

**Step 4: Run tests**

Run: `bun test src/config.test.ts`
Expected: All pass.

**Step 5: Commit**

```bash
git add src/config.ts src/config.test.ts
git commit -m "feat: add config loader with .muxi.json and .muxi.ts support"
```

---

### Task 3: Process Manager

**Files:**
- Create: `src/process.ts`
- Create: `src/process.test.ts`

**Step 1: Write the test**

```ts
import { test, expect, afterEach } from "bun:test";
import { ProcessManager } from "../src/process";

let pm: ProcessManager | null = null;

afterEach(() => {
  pm?.kill();
  pm = null;
});

test("ProcessManager: spawns a process and captures output", async () => {
  pm = new ProcessManager({
    cmd: 'echo "hello muxi"',
    cols: 80,
    rows: 24,
  });

  pm.start();
  expect(pm.status).toBe("running");

  // Wait for process to finish
  await new Promise((resolve) => setTimeout(resolve, 500));

  const output = pm.getOutput();
  expect(output.some((line) => line.includes("hello muxi"))).toBe(true);
});

test("ProcessManager: starts in idle state", () => {
  pm = new ProcessManager({
    cmd: "echo hi",
    cols: 80,
    rows: 24,
  });
  expect(pm.status).toBe("idle");
  expect(pm.getOutput()).toEqual([]);
});

test("ProcessManager: can clear output", async () => {
  pm = new ProcessManager({
    cmd: 'echo "test output"',
    cols: 80,
    rows: 24,
  });
  pm.start();
  await new Promise((resolve) => setTimeout(resolve, 500));
  expect(pm.getOutput().length).toBeGreaterThan(0);

  pm.clearOutput();
  expect(pm.getOutput()).toEqual([]);
});

test("ProcessManager: can kill a process", async () => {
  pm = new ProcessManager({
    cmd: "sleep 60",
    cols: 80,
    rows: 24,
  });
  pm.start();
  expect(pm.status).toBe("running");

  pm.kill();
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(["stopped", "errored"]).toContain(pm.status);
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/process.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement ProcessManager**

Create `src/process.ts`:
```ts
import type { ProcessStatus } from "./types";

const MAX_OUTPUT_LINES = 10_000;

interface ProcessManagerOptions {
  cmd: string;
  cwd?: string;
  env?: Record<string, string>;
  cols: number;
  rows: number;
  onOutput?: (data: string) => void;
  onStatusChange?: (status: ProcessStatus) => void;
}

export class ProcessManager {
  private proc: ReturnType<typeof Bun.spawn> | null = null;
  private outputLines: string[] = [];
  private partialLine: string = "";
  private opts: ProcessManagerOptions;

  status: ProcessStatus = "idle";

  constructor(opts: ProcessManagerOptions) {
    this.opts = opts;
  }

  start() {
    if (this.status === "running") return;

    this.setStatus("starting");

    const shell = Bun.env.SHELL || "/bin/sh";

    this.proc = Bun.spawn([shell, "-c", this.opts.cmd], {
      cwd: this.opts.cwd,
      env: { ...Bun.env, ...this.opts.env },
      terminal: {
        cols: this.opts.cols,
        rows: this.opts.rows,
        data: (_terminal, data) => {
          this.handleData(typeof data === "string" ? data : new TextDecoder().decode(data));
        },
        exit: () => {
          this.setStatus("stopped");
        },
      },
    });

    this.setStatus("running");
  }

  private handleData(data: string) {
    // Split on newlines, keeping partial lines
    const text = this.partialLine + data;
    const lines = text.split("\n");

    // Last element is either empty (if data ended with \n) or a partial line
    this.partialLine = lines.pop() ?? "";

    for (const line of lines) {
      this.outputLines.push(line);
    }

    // Trim to max lines
    if (this.outputLines.length > MAX_OUTPUT_LINES) {
      this.outputLines = this.outputLines.slice(-MAX_OUTPUT_LINES);
    }

    this.opts.onOutput?.(data);
  }

  kill() {
    if (!this.proc) return;
    this.setStatus("stopping");
    this.proc.kill("SIGTERM");

    // Force kill after 3 seconds
    setTimeout(() => {
      if (this.status === "stopping") {
        this.proc?.kill("SIGKILL");
        this.setStatus("stopped");
      }
    }, 3000);
  }

  restart() {
    this.kill();
    // Wait a bit for cleanup, then start
    setTimeout(() => {
      this.start();
    }, 500);
  }

  resize(cols: number, rows: number) {
    if (this.proc?.terminal) {
      this.proc.terminal.resize(cols, rows);
    }
  }

  write(data: string) {
    if (this.proc?.terminal) {
      this.proc.terminal.write(data);
    }
  }

  clearOutput() {
    this.outputLines = [];
    this.partialLine = "";
  }

  getOutput(): string[] {
    if (this.partialLine) {
      return [...this.outputLines, this.partialLine];
    }
    return [...this.outputLines];
  }

  private setStatus(status: ProcessStatus) {
    this.status = status;
    this.opts.onStatusChange?.(status);
  }
}
```

**Step 4: Run tests**

Run: `bun test src/process.test.ts`
Expected: All pass.

**Step 5: Commit**

```bash
git add src/process.ts src/process.test.ts
git commit -m "feat: add ProcessManager with Bun.Terminal PTY support"
```

---

### Task 4: Fullscreen App Shell

**Files:**
- Create: `src/app.tsx`
- Modify: `bin/muxi.ts`

**Step 1: Create the fullscreen app shell**

Create `src/app.tsx`:
```tsx
import React, { useEffect, useState, useCallback } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import type { NormalizedConfig } from "./config";
import type { ProcessStatus, TabState } from "./types";

const ENTER_ALT_SCREEN = "\x1b[?1049h";
const LEAVE_ALT_SCREEN = "\x1b[?1049l";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";

function FullScreen({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    process.stdout.write(ENTER_ALT_SCREEN + HIDE_CURSOR);
    return () => {
      process.stdout.write(SHOW_CURSOR + LEAVE_ALT_SCREEN);
    };
  }, []);
  return <>{children}</>;
}

interface AppProps {
  config: NormalizedConfig;
}

export function App({ config }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const width = stdout?.columns ?? 80;
  const height = stdout?.rows ?? 24;

  const tabNames = Object.keys(config.commands);
  const [activeTab, setActiveTab] = useState(0);

  useInput((input, key) => {
    // Quit
    if (input === "q") {
      exit();
      return;
    }

    // Tab switching with arrow keys
    if (key.leftArrow) {
      setActiveTab((i) => (i > 0 ? i - 1 : tabNames.length - 1));
    }
    if (key.rightArrow) {
      setActiveTab((i) => (i < tabNames.length - 1 ? i + 1 : 0));
    }

    // Tab switching with number keys
    const num = parseInt(input, 10);
    if (num >= 1 && num <= tabNames.length) {
      setActiveTab(num - 1);
    }
  });

  return (
    <FullScreen>
      <Box flexDirection="column" height={height} width={width}>
        {/* Tab Bar */}
        <Box>
          {tabNames.map((name, i) => (
            <Box key={name} marginRight={1}>
              <Text
                bold={i === activeTab}
                color={i === activeTab ? "cyan" : "gray"}
                inverse={i === activeTab}
              >
                {` ${i + 1}:${name} `}
              </Text>
            </Box>
          ))}
        </Box>

        {/* Output Pane */}
        <Box flexDirection="column" flexGrow={1} overflow="hidden" borderStyle="single" borderColor="gray">
          <Text color="gray">
            Tab: {tabNames[activeTab]} — output will appear here
          </Text>
        </Box>

        {/* Hotkey Bar */}
        <Box>
          <Text>
            <Text color="yellow">[s]</Text><Text>tart/stop </Text>
            <Text color="yellow">[r]</Text><Text>estart </Text>
            <Text color="yellow">[c]</Text><Text>lear </Text>
            <Text color="yellow">[p]</Text><Text>ause </Text>
            <Text color="yellow">[←→]</Text><Text> tabs </Text>
            <Text color="yellow">[↑↓]</Text><Text> scroll </Text>
            <Text color="yellow">[q]</Text><Text>uit</Text>
          </Text>
        </Box>
      </Box>
    </FullScreen>
  );
}
```

**Step 2: Update bin/muxi.ts to load config and render App**

```ts
#!/usr/bin/env bun
import React from "react";
import { render } from "ink";
import { App } from "../src/app.js";
import { loadConfig } from "../src/config.js";

const cwd = process.cwd();

try {
  const config = await loadConfig(cwd);
  render(React.createElement(App, { config }));
} catch (err: any) {
  console.error(`muxi: ${err.message}`);
  process.exit(1);
}
```

**Step 3: Create a test .muxi.json in the project root**

```json
{
  "commands": {
    "Echo": "echo 'Hello from muxi!'",
    "Date": "date",
    "Sleep": {
      "cmd": "sleep 999",
      "autostart": false
    }
  }
}
```

**Step 4: Run it manually to verify fullscreen shell works**

Run: `bun bin/muxi.ts`
Expected: Fullscreen TUI with tabs [1:Echo] [2:Date] [3:Sleep], arrow keys switch tabs, `q` quits cleanly back to normal terminal.

**Step 5: Commit**

```bash
git add src/app.tsx bin/muxi.ts .muxi.json
git commit -m "feat: add fullscreen app shell with tab bar and hotkey bar"
```

---

### Task 5: Wire Up Process Management to Tabs

**Files:**
- Create: `src/hooks/useProcesses.ts`
- Modify: `src/app.tsx`
- Modify: `src/process.ts` (add onChange callback support)

**Step 1: Create useProcesses hook**

Create `src/hooks/useProcesses.ts`:
```tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useStdout } from "ink";
import { ProcessManager } from "../process.js";
import type { NormalizedConfig } from "../config.js";
import type { ProcessStatus } from "../types.js";

interface TabProcess {
  name: string;
  manager: ProcessManager;
  status: ProcessStatus;
  output: string[];
}

export function useProcesses(config: NormalizedConfig) {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;
  const rows = (stdout?.rows ?? 24) - 4; // subtract tab bar, border, hotkey bar

  const [tick, setTick] = useState(0);
  const managersRef = useRef<Map<string, ProcessManager>>(new Map());

  // Initialize managers once
  useEffect(() => {
    const managers = managersRef.current;

    for (const [name, cmdConfig] of Object.entries(config.commands)) {
      if (managers.has(name)) continue;

      const pm = new ProcessManager({
        cmd: cmdConfig.cmd,
        cwd: cmdConfig.cwd,
        env: cmdConfig.env,
        cols,
        rows,
        onOutput: () => setTick((t) => t + 1),
        onStatusChange: () => setTick((t) => t + 1),
      });

      managers.set(name, pm);

      if (cmdConfig.autostart !== false) {
        pm.start();
      }
    }

    // Cleanup on unmount
    return () => {
      for (const pm of managers.values()) {
        pm.kill();
      }
    };
  }, []);

  const getTab = useCallback((name: string): TabProcess | null => {
    const pm = managersRef.current.get(name);
    if (!pm) return null;
    return {
      name,
      manager: pm,
      status: pm.status,
      output: pm.getOutput(),
    };
  }, [tick]);

  const startProcess = useCallback((name: string) => {
    managersRef.current.get(name)?.start();
  }, []);

  const stopProcess = useCallback((name: string) => {
    managersRef.current.get(name)?.kill();
  }, []);

  const restartProcess = useCallback((name: string) => {
    managersRef.current.get(name)?.restart();
  }, []);

  const clearOutput = useCallback((name: string) => {
    managersRef.current.get(name)?.clearOutput();
    setTick((t) => t + 1);
  }, []);

  const writeToProcess = useCallback((name: string, data: string) => {
    managersRef.current.get(name)?.write(data);
  }, []);

  const killAll = useCallback(() => {
    for (const pm of managersRef.current.values()) {
      pm.kill();
    }
  }, []);

  return {
    getTab,
    startProcess,
    stopProcess,
    restartProcess,
    clearOutput,
    writeToProcess,
    killAll,
  };
}
```

**Step 2: Update src/app.tsx to wire in processes**

Replace the App component in `src/app.tsx` to integrate `useProcesses`:

- Import `useProcesses` from `./hooks/useProcesses.js`
- Call `useProcesses(config)` and use `getTab` to render output
- Wire `s` key to start/stop, `r` to restart, `c` to clear
- Wire up/down arrows for scrolling with a `scrollOffset` state
- Wire `p`/`f` for pause/follow toggle
- On quit, call `killAll()` before `exit()`

The OutputPane area should render the last N lines of the active tab's output (where N = available height), offset by `scrollOffset`. When `following` is true (default), scrollOffset stays at the bottom.

**Step 3: Test manually**

Update `.muxi.json` to use a long-running command:
```json
{
  "commands": {
    "Counter": "bash -c 'i=0; while true; do echo \"Line $i\"; i=$((i+1)); sleep 0.5; done'",
    "Date": "bash -c 'while true; do date; sleep 1; done'",
    "Manual": {
      "cmd": "echo 'Started manually!'",
      "autostart": false
    }
  }
}
```

Run: `bun bin/muxi.ts`
Expected:
- Counter and Date tabs auto-start, output scrolls
- Manual tab shows "Press [s] to start"
- Arrow keys switch tabs
- `s` starts/stops the active process
- `r` restarts it
- `c` clears output
- Up/down scrolls through output
- `q` kills all processes and exits

**Step 4: Commit**

```bash
git add src/hooks/useProcesses.ts src/app.tsx .muxi.json
git commit -m "feat: wire process management to tabs with start/stop/restart/scroll"
```

---

### Task 6: Interactive Mode

**Files:**
- Modify: `src/app.tsx`

**Step 1: Add interactive mode state**

Add an `interactive` boolean state to the App component. When `interactive` is true:

- The `useInput` handler changes behavior: instead of interpreting keys as hotkeys, it forwards raw input to the active process via `writeToProcess(name, input)`
- Special handling: `Ctrl+X` (key.ctrl && input === 'x') exits interactive mode
- The hotkey bar updates to show `[Ctrl+X] exit interactive` instead of normal hotkeys
- A visual indicator shows "INTERACTIVE" in the tab bar or status area

**Step 2: Handle special keys in interactive mode**

In interactive mode, forward these to the PTY:
- Regular characters: `writeToProcess(name, input)`
- Enter: `writeToProcess(name, "\r")`
- Backspace: `writeToProcess(name, "\x7f")`
- Arrow keys: send ANSI escape sequences (`\x1b[A`, `\x1b[B`, `\x1b[C`, `\x1b[D`)
- Tab: `writeToProcess(name, "\t")`

**Step 3: Test manually**

Change `.muxi.json` to include an interactive command:
```json
{
  "commands": {
    "Shell": "bash",
    "Counter": "bash -c 'i=0; while true; do echo \"Line $i\"; i=$((i+1)); sleep 1; done'"
  }
}
```

Run: `bun bin/muxi.ts`
Expected:
- On Shell tab, press `i` to enter interactive mode
- Type commands and they execute in bash
- `Ctrl+X` exits interactive mode back to normal

**Step 4: Commit**

```bash
git add src/app.tsx
git commit -m "feat: add interactive mode for sending input to processes"
```

---

### Task 7: Log Tailing Mode

**Files:**
- Create: `src/components/LogTailPane.tsx`
- Modify: `src/app.tsx`

**Step 1: Create LogTailPane component**

Create `src/components/LogTailPane.tsx`:
```tsx
import React from "react";
import { Box, Text } from "ink";

// ANSI color codes for log levels
const LOG_LEVEL_COLORS: Record<string, string> = {
  ERROR: "red",
  FATAL: "red",
  WARN: "yellow",
  WARNING: "yellow",
  INFO: "blue",
  DEBUG: "gray",
  TRACE: "gray",
};

// Regex patterns for common log formats
const LOG_LEVEL_REGEX = /\b(ERROR|FATAL|WARN(?:ING)?|INFO|DEBUG|TRACE)\b/i;
const JSON_LOG_REGEX = /^\s*\{.*"level"\s*:/;

interface LogTailPaneProps {
  lines: string[];
  height: number;
  width: number;
  scrollOffset: number;
  wrap: boolean;
}

function colorizeLogLine(line: string): React.ReactNode {
  const match = line.match(LOG_LEVEL_REGEX);
  if (!match) return <Text>{line}</Text>;

  const level = match[0].toUpperCase();
  const color = LOG_LEVEL_COLORS[level] || undefined;

  return <Text color={color as any}>{line}</Text>;
}

export function LogTailPane({ lines, height, width, scrollOffset, wrap }: LogTailPaneProps) {
  const visibleLines = lines.slice(
    Math.max(0, lines.length - height - scrollOffset),
    lines.length - scrollOffset
  );

  return (
    <Box flexDirection="column" height={height} overflow="hidden">
      {visibleLines.map((line, i) => (
        <Box key={i} width={width}>
          {colorizeLogLine(wrap ? line : line.slice(0, width))}
        </Box>
      ))}
    </Box>
  );
}
```

**Step 2: Integrate into app.tsx**

When the active tab's config has `type: "log"`:
- Render `<LogTailPane>` instead of the default output pane
- Add `w` hotkey to toggle line wrapping
- Add `t` hotkey to truncate/clear the log output
- Show these extra hotkeys in the hotkey bar

**Step 3: Test manually**

Add a log-type command to `.muxi.json`:
```json
{
  "commands": {
    "Server": "bash -c 'while true; do echo \"[$(date +%H:%M:%S)] INFO  Request GET /api/users 200 12ms\"; sleep 0.5; echo \"[$(date +%H:%M:%S)] ERROR Connection refused to database\"; sleep 2; done'",
    "Logs": {
      "cmd": "bash -c 'while true; do echo \"[$(date +%H:%M:%S)] INFO  Request processed\"; sleep 0.3; echo \"[$(date +%H:%M:%S)] WARN  Slow query detected (245ms)\"; sleep 1; echo \"[$(date +%H:%M:%S)] ERROR Failed to connect\"; sleep 2; done'",
      "type": "log"
    }
  }
}
```

Run: `bun bin/muxi.ts`
Expected:
- Server tab: normal output
- Logs tab: log lines colored by level (ERROR=red, WARN=yellow, INFO=blue)
- `w` toggles wrapping on Logs tab
- `t` clears log output

**Step 4: Commit**

```bash
git add src/components/LogTailPane.tsx src/app.tsx
git commit -m "feat: add log tailing mode with level colorization"
```

---

### Task 8: Component Refinement and Polish

**Files:**
- Modify: `src/app.tsx`

**Step 1: Add process status indicators to tabs**

Show a colored dot or label next to each tab name:
- Running: green dot or `●`
- Idle/Stopped: gray `○`
- Errored: red `●`
- Starting/Stopping: yellow `◐`

**Step 2: Add "Press [s] to start" placeholder for idle tabs**

When a tab's process is idle (autostart: false and not yet started), show a centered message instead of empty output.

**Step 3: Add terminal resize handling**

When the terminal resizes, update the PTY dimensions via `pm.resize(cols, rows)`. Use `useStdout()` which re-renders on resize.

**Step 4: Test manually**

Run: `bun bin/muxi.ts`
Expected:
- Status indicators show correctly
- Idle tabs show placeholder
- Resizing terminal doesn't break layout

**Step 5: Commit**

```bash
git add src/app.tsx
git commit -m "feat: add status indicators, idle placeholder, resize handling"
```

---

### Task 9: CLI Arguments and Init Command

**Files:**
- Modify: `bin/muxi.ts`

**Step 1: Add CLI argument parsing**

Support these args:
- `muxi` — run with config from cwd
- `muxi init` — generate a `.muxi.json` from package.json scripts (JS extra)
- `muxi --help` — show usage
- `muxi --version` — show version

**Step 2: Implement init command**

When `muxi init` is run:
1. Check if `.muxi.json` already exists (warn and exit if so)
2. Check for `package.json` — if found, read `scripts` and generate a `.muxi.json` with each script as a command
3. If no `package.json`, generate a minimal template
4. Write the file and print a success message

**Step 3: Test manually**

In a directory with a `package.json` that has scripts:
Run: `bun bin/muxi.ts init`
Expected: Creates `.muxi.json` with commands derived from package.json scripts.

**Step 4: Commit**

```bash
git add bin/muxi.ts
git commit -m "feat: add CLI args (init, --help, --version)"
```

---

### Task 10: Final Integration Test and Cleanup

**Files:**
- Modify: `package.json` (ensure bin is correct)
- Modify: `.muxi.json` (final example config)
- Create: `.gitignore`

**Step 1: Create .gitignore**

```
node_modules/
dist/
*.tgz
```

**Step 2: Update .muxi.json with a good example config**

```json
{
  "commands": {
    "Echo": "echo 'Hello from muxi!'",
    "Counter": "bash -c 'i=0; while true; do echo \"[$i] $(date)\"; i=$((i+1)); sleep 1; done'",
    "Manual": {
      "cmd": "echo 'Started manually!'",
      "autostart": false
    }
  }
}
```

**Step 3: Run full integration test**

Run: `bun bin/muxi.ts`

Verify:
- [ ] App launches fullscreen
- [ ] Tabs display with correct names and status indicators
- [ ] Auto-start commands begin running
- [ ] Manual commands show "Press [s] to start"
- [ ] Tab switching with arrow keys and number keys works
- [ ] Output scrolling with up/down arrows works
- [ ] `s` starts/stops processes
- [ ] `r` restarts processes
- [ ] `c` clears output
- [ ] `p`/`f` pause/follow works
- [ ] `i` enters interactive mode, `Ctrl+X` exits
- [ ] `q` exits cleanly (all processes killed, terminal restored)
- [ ] Terminal resize doesn't break layout

**Step 4: Run all tests**

Run: `bun test`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: final integration cleanup for muxi v0.1.0"
```
