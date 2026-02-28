#!/usr/bin/env bun
import React from "react";
import { render, Box, Text } from "ink";

function App() {
  return React.createElement(
    Box,
    null,
    React.createElement(Text, { bold: true, color: "cyan" }, "muxi"),
    React.createElement(Text, null, " - terminal multiplexer")
  );
}

render(React.createElement(App));
