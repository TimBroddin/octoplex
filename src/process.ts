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
          this.handleData(new TextDecoder().decode(data));
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
