#!/usr/bin/env bun
import React from "react";
import { render } from "ink";
import { App } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { join } from "path";

const args = process.argv.slice(2);
const command = args[0];

// ── Helpers ─────────────────────────────────────────────────────────

async function getVersion(): Promise<string> {
  const pkgPath = join(import.meta.dir, "..", "package.json");
  const pkg = await Bun.file(pkgPath).json();
  return pkg.version;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function scriptDisplayName(name: string): string {
  const mapping: Record<string, string> = {
    dev: "Dev Server",
    start: "Start",
    build: "Build",
    test: "Tests",
    lint: "Lint",
    format: "Format",
    watch: "Watch",
    serve: "Serve",
    preview: "Preview",
    typecheck: "Typecheck",
  };
  return mapping[name] ?? capitalize(name);
}

// ── --help ──────────────────────────────────────────────────────────

async function showHelp() {
  const version = await getVersion();
  console.log(`octoplex v${version} — terminal multiplexer

Usage:
  octoplex              Start with config from current directory
  octoplex init         Generate a .octoplex.json config file
  octoplex --help       Show this help message
  octoplex --version    Show version`);
}

// ── init ────────────────────────────────────────────────────────────

async function initConfig() {
  const cwd = process.cwd();
  const configPath = join(cwd, ".octoplex.json");

  // Check if config already exists
  if (await Bun.file(configPath).exists()) {
    console.warn("octoplex: .octoplex.json already exists in this directory.");
    process.exit(1);
  }

  const pkgPath = join(cwd, "package.json");
  let config: Record<string, unknown>;

  if (await Bun.file(pkgPath).exists()) {
    // Generate from package.json scripts
    const pkg = await Bun.file(pkgPath).json();
    const scripts: Record<string, string> = pkg.scripts ?? {};
    const commands: Record<string, unknown> = {};

    for (const [name, script] of Object.entries(scripts)) {
      const displayName = scriptDisplayName(name);
      const autostart = name !== "test";

      if (autostart) {
        // Use shorthand string form for autostart commands
        commands[displayName] = script;
      } else {
        commands[displayName] = {
          cmd: script,
          autostart: false,
        };
      }
    }

    // If no scripts were found, add an example
    if (Object.keys(commands).length === 0) {
      commands["Example"] = "echo 'Hello from octoplex!'";
    }

    config = { commands };
  } else {
    // No package.json — generate a minimal template
    config = {
      commands: {
        Example: "echo 'Hello from octoplex!'",
      },
    };
  }

  await Bun.write(configPath, JSON.stringify(config, null, 2) + "\n");
  console.log(`octoplex: created .octoplex.json with ${Object.keys(config.commands as Record<string, unknown>).length} command(s).`);
}

// ── Main ────────────────────────────────────────────────────────────

if (command === "--help" || command === "-h") {
  await showHelp();
} else if (command === "--version" || command === "-v") {
  const version = await getVersion();
  console.log(`octoplex v${version}`);
} else if (command === "init") {
  await initConfig();
} else if (!command) {
  // Default: run with config from cwd
  const cwd = process.cwd();
  const configPath = join(cwd, ".octoplex.json");

  // If no config exists, run init and open in editor
  if (!(await Bun.file(configPath).exists()) && !(await Bun.file(join(cwd, ".octoplex.ts")).exists())) {
    await initConfig();
    process.stdout.write("octoplex: press Enter to open in editor...");
    for await (const chunk of Bun.stdin.stream()) {
      if (new TextDecoder().decode(chunk).includes("\n")) break;
    }

    const editor = Bun.env.EDITOR || Bun.env.VISUAL || "vi";
    const proc = Bun.spawn([editor, configPath], {
      stdio: ["inherit", "inherit", "inherit"],
    });
    await proc.exited;

    console.log("\noctoplex: config saved! Run `octoplex` to start.");
    process.exit(0);
  }

  try {
    const config = await loadConfig(cwd);
    render(React.createElement(App, { config }));
  } catch (err: any) {
    console.error(`octoplex: ${err.message}`);
    process.exit(1);
  }
} else {
  console.error(`octoplex: unknown command "${command}"`);
  console.error('Run "octoplex --help" for usage.');
  process.exit(1);
}
