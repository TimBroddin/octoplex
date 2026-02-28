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

  const getTab = useCallback(
    (name: string): TabProcess | null => {
      const pm = managersRef.current.get(name);
      if (!pm) return null;
      return {
        name,
        manager: pm,
        status: pm.status,
        output: pm.getOutput(),
      };
    },
    [tick],
  );

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

  // Resize all PTYs when terminal dimensions change
  useEffect(() => {
    for (const pm of managersRef.current.values()) {
      pm.resize(cols, rows);
    }
  }, [cols, rows]);

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
