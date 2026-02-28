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
