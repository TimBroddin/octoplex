import { test, expect, afterEach } from "bun:test";
import { ProcessManager } from "./process";

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
