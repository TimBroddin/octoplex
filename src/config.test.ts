import { test, expect, beforeEach, afterEach } from "bun:test";
import { loadConfig, normalizeCommand } from "./config";
import { join } from "path";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "octoplex-test-"));
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

test("loadConfig: reads .octoplex.json", async () => {
  await Bun.write(
    join(testDir, ".octoplex.json"),
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

test("loadConfig: reads .octoplex.ts", async () => {
  await Bun.write(
    join(testDir, ".octoplex.ts"),
    `export default { commands: { "Server": "bun run start" } };`
  );
  const config = await loadConfig(testDir);
  expect(config.commands["Server"].cmd).toBe("bun run start");
});

test("loadConfig: throws when no config found", async () => {
  expect(loadConfig(testDir)).rejects.toThrow("No .octoplex.json or .octoplex.ts found");
});
