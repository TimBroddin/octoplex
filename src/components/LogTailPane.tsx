import React from "react";
import { Box, Text } from "ink";

const LOG_LEVEL_COLORS: Record<string, string> = {
  ERROR: "red",
  FATAL: "red",
  WARN: "yellow",
  WARNING: "yellow",
  INFO: "blue",
  DEBUG: "gray",
  TRACE: "gray",
};

const LOG_LEVEL_REGEX = /\b(ERROR|FATAL|WARN(?:ING)?|INFO|DEBUG|TRACE)\b/i;

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
