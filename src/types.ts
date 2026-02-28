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
