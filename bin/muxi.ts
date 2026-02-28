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
