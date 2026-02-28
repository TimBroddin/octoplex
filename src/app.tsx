import React, { useEffect, useState } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import type { NormalizedConfig } from "./config.js";
import { useProcesses } from "./hooks/useProcesses.js";

const ENTER_ALT_SCREEN = "\x1b[?1049h";
const LEAVE_ALT_SCREEN = "\x1b[?1049l";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";

function FullScreen({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    process.stdout.write(ENTER_ALT_SCREEN + HIDE_CURSOR);
    return () => {
      process.stdout.write(SHOW_CURSOR + LEAVE_ALT_SCREEN);
    };
  }, []);
  return <>{children}</>;
}

interface AppProps {
  config: NormalizedConfig;
}

export function App({ config }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const width = stdout?.columns ?? 80;
  const height = stdout?.rows ?? 24;

  const tabNames = Object.keys(config.commands);
  const [activeTab, setActiveTab] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [following, setFollowing] = useState(true);
  const [interactive, setInteractive] = useState(false);

  const {
    getTab,
    startProcess,
    stopProcess,
    restartProcess,
    clearOutput,
    writeToProcess,
    killAll,
  } = useProcesses(config);

  // Height available for output lines inside the bordered box
  // Total height - tab bar (1) - border top/bottom (2) - hotkey bar (1) = height - 4
  const outputHeight = height - 4;

  const activeTabName = tabNames[activeTab];
  const tab = getTab(activeTabName);

  // Reset scroll, following, and interactive mode when switching tabs
  useEffect(() => {
    setScrollOffset(0);
    setFollowing(true);
    setInteractive(false);
  }, [activeTab]);

  useInput((input, key) => {
    // Interactive mode: forward input to the active process PTY
    if (interactive) {
      // Ctrl+X exits interactive mode
      if (key.ctrl && input === "x") {
        setInteractive(false);
        return;
      }

      // Forward keypresses to the process
      if (key.return) {
        writeToProcess(activeTabName, "\r");
      } else if (key.backspace || key.delete) {
        writeToProcess(activeTabName, "\x7f");
      } else if (key.upArrow) {
        writeToProcess(activeTabName, "\x1b[A");
      } else if (key.downArrow) {
        writeToProcess(activeTabName, "\x1b[B");
      } else if (key.rightArrow) {
        writeToProcess(activeTabName, "\x1b[C");
      } else if (key.leftArrow) {
        writeToProcess(activeTabName, "\x1b[D");
      } else if (key.tab) {
        writeToProcess(activeTabName, "\t");
      } else if (key.escape) {
        writeToProcess(activeTabName, "\x1b");
      } else if (input) {
        writeToProcess(activeTabName, input);
      }

      // Suppress all normal hotkeys while in interactive mode
      return;
    }

    // --- Normal mode ---

    // Quit
    if (input === "q") {
      killAll();
      exit();
      return;
    }

    // Enter interactive mode
    if (input === "i") {
      if (tab && (tab.status === "running" || tab.status === "starting")) {
        setInteractive(true);
        setFollowing(true);
        setScrollOffset(0);
      }
      return;
    }

    // Tab switching with arrow keys
    if (key.leftArrow) {
      setActiveTab((i) => (i > 0 ? i - 1 : tabNames.length - 1));
    }
    if (key.rightArrow) {
      setActiveTab((i) => (i < tabNames.length - 1 ? i + 1 : 0));
    }

    // Tab switching with number keys
    const num = parseInt(input, 10);
    if (num >= 1 && num <= tabNames.length) {
      setActiveTab(num - 1);
    }

    // Scroll up
    if (key.upArrow) {
      setFollowing(false);
      setScrollOffset((prev) => prev + 1);
    }

    // Scroll down
    if (key.downArrow) {
      setScrollOffset((prev) => {
        const next = Math.max(0, prev - 1);
        if (next === 0) setFollowing(true);
        return next;
      });
    }

    // Start/Stop toggle
    if (input === "s") {
      if (tab) {
        if (tab.status === "running" || tab.status === "starting") {
          stopProcess(activeTabName);
        } else {
          startProcess(activeTabName);
        }
      }
    }

    // Restart
    if (input === "r") {
      restartProcess(activeTabName);
    }

    // Clear
    if (input === "c") {
      clearOutput(activeTabName);
      setScrollOffset(0);
      setFollowing(true);
    }

    // Pause following
    if (input === "p") {
      setFollowing(false);
    }

    // Follow / resume auto-scroll
    if (input === "f") {
      setFollowing(true);
      setScrollOffset(0);
    }
  });

  // Compute visible lines
  let visibleLines: string[] = [];
  if (tab) {
    const allLines = tab.output;
    const totalLines = allLines.length;

    if (following) {
      // Show the last outputHeight lines
      const start = Math.max(0, totalLines - outputHeight);
      visibleLines = allLines.slice(start, start + outputHeight);
    } else {
      // scrollOffset counts lines from the bottom
      const end = Math.max(0, totalLines - scrollOffset);
      const start = Math.max(0, end - outputHeight);
      visibleLines = allLines.slice(start, end);
      // Clamp scrollOffset so we don't scroll past the top
      const maxOffset = Math.max(0, totalLines - outputHeight);
      if (scrollOffset > maxOffset) {
        setScrollOffset(maxOffset);
      }
    }
  }

  // Status indicator
  const statusColor =
    tab?.status === "running"
      ? "green"
      : tab?.status === "stopped" || tab?.status === "errored"
        ? "red"
        : tab?.status === "starting" || tab?.status === "stopping"
          ? "yellow"
          : "gray";

  const showStartPrompt =
    tab && (tab.status === "idle" || tab.status === "stopped") && tab.output.length === 0;

  return (
    <FullScreen>
      <Box flexDirection="column" height={height} width={width}>
        {/* Tab Bar */}
        <Box>
          {tabNames.map((name, i) => {
            const t = getTab(name);
            const isActive = i === activeTab;
            const dotColor =
              t?.status === "running"
                ? "green"
                : t?.status === "stopped" || t?.status === "errored"
                  ? "red"
                  : "gray";
            return (
              <Box key={name} marginRight={1}>
                <Text
                  bold={isActive}
                  color={isActive ? "cyan" : "gray"}
                  inverse={isActive}
                >
                  {" "}
                  <Text color={dotColor}>●</Text> {i + 1}:{name}{" "}
                </Text>
              </Box>
            );
          })}
          <Box flexGrow={1} justifyContent="flex-end">
            <Text color={statusColor}>{tab?.status ?? "unknown"}</Text>
            {interactive && <Text color="magenta"> [INTERACTIVE]</Text>}
            {!following && !interactive && <Text color="yellow"> [PAUSED]</Text>}
          </Box>
        </Box>

        {/* Output Pane */}
        <Box
          flexDirection="column"
          flexGrow={1}
          overflow="hidden"
          borderStyle="single"
          borderColor="gray"
        >
          {showStartPrompt ? (
            <Box flexGrow={1} alignItems="center" justifyContent="center">
              <Text color="gray">
                Press <Text color="yellow">[s]</Text> to start
              </Text>
            </Box>
          ) : (
            visibleLines.map((line, i) => (
              <Text key={i} wrap="truncate">
                {line}
              </Text>
            ))
          )}
        </Box>

        {/* Hotkey Bar */}
        <Box>
          {interactive ? (
            <Text>
              <Text color="magenta" bold>INTERACTIVE</Text>
              <Text> — typing is sent to process | </Text>
              <Text color="yellow">[Ctrl+X]</Text>
              <Text> exit interactive</Text>
            </Text>
          ) : (
            <Text>
              <Text color="yellow">[s]</Text>
              <Text>tart/stop </Text>
              <Text color="yellow">[r]</Text>
              <Text>estart </Text>
              <Text color="yellow">[c]</Text>
              <Text>lear </Text>
              <Text color="yellow">[i]</Text>
              <Text>nteractive </Text>
              <Text color="yellow">[p]</Text>
              <Text>ause </Text>
              <Text color="yellow">[f]</Text>
              <Text>ollow </Text>
              <Text color="yellow">[←→]</Text>
              <Text> tabs </Text>
              <Text color="yellow">[↑↓]</Text>
              <Text> scroll </Text>
              <Text color="yellow">[q]</Text>
              <Text>uit</Text>
            </Text>
          )}
        </Box>
      </Box>
    </FullScreen>
  );
}
