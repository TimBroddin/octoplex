import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useInput, useApp, useStdout, type DOMElement } from "ink";
import { MouseProvider, useOnClick, useMouse } from "@ink-tools/ink-mouse";
import type { NormalizedConfig } from "./config.js";
import { useProcesses } from "./hooks/useProcesses.js";
import { LogTailPane } from "./components/LogTailPane.js";

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

interface TabButtonProps {
  name: string;
  index: number;
  isActive: boolean;
  dotColor: string;
  onClick: () => void;
}

function TabButton({ name, index, isActive, dotColor, onClick }: TabButtonProps) {
  const ref = useRef<DOMElement>(null);
  useOnClick(ref, onClick);

  return (
    <Box ref={ref} marginRight={1}>
      <Text
        bold={isActive}
        color={isActive ? "cyan" : "gray"}
        inverse={isActive}
      >
        {" "}
        <Text color={dotColor}>●</Text> {index + 1}:{name}{" "}
      </Text>
    </Box>
  );
}

const ABOUT_TAB = "__about__";

const LOGO_FRAMES = [
  [
    "                    ╭─╮",
    " ╭─╮╭─╮╭─╮╭─╮╭─╮  │ │",
    " │ ╰╯ ╰╯ ╰╯ ╰╯ │  │ │",
    " │               │  │ │",
    " │  m u x i      │  │ │",
    " │               ╰──╯ │",
    " ╰────────────────────╯",
  ],
  [
    "                   ╭──╮",
    " ╭─╮╭─╮╭─╮╭─╮╭─╮ │  │",
    " │ ╰╯ ╰╯ ╰╯ ╰╯ │ │  │",
    " │               │ │  │",
    " │  m u x i      │ │  │",
    " │               ╰─╯  │",
    " ╰────────────────────╯",
  ],
  [
    "                  ╭───╮",
    " ╭─╮╭─╮╭─╮╭─╮╭──╯   │",
    " │ ╰╯ ╰╯ ╰╯ ╰╯      │",
    " │                    │",
    " │  m u x i           │",
    " │               ╭────╯",
    " ╰───────────────╯     ",
  ],
  [
    "                   ╭──╮",
    " ╭─╮╭─╮╭─╮╭─╮╭─╮ │  │",
    " │ ╰╯ ╰╯ ╰╯ ╰╯ │ │  │",
    " │               │ │  │",
    " │  m u x i      │ │  │",
    " │               ╰─╯  │",
    " ╰────────────────────╯",
  ],
];

function AboutPane({ width, height }: { width: number; height: number }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % LOGO_FRAMES.length);
    }, 400);
    return () => clearInterval(timer);
  }, []);

  const logo = LOGO_FRAMES[frame];

  return (
    <Box flexDirection="column" height={height} alignItems="center" justifyContent="center">
      {logo.map((line, i) => (
        <Text key={i} color="cyan">{line}</Text>
      ))}
      <Text> </Text>
      <Text dimColor>v0.1.0</Text>
      <Text> </Text>
      <Text>A terminal multiplexer TUI</Text>
      <Text> </Text>
      <Text>Created by <Text bold>Tim Broddin</Text></Text>
      <Text color="blue">titansofindustry.be</Text>
      <Text> </Text>
      <Text dimColor>Press ← or → to switch tabs</Text>
    </Box>
  );
}

interface AppProps {
  config: NormalizedConfig;
}

export function App({ config }: AppProps) {
  return (
    <MouseProvider>
      <AppContent config={config} />
    </MouseProvider>
  );
}

function AppContent({ config }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const mouse = useMouse();
  const width = stdout?.columns ?? 80;
  const height = stdout?.rows ?? 24;

  const commandNames = Object.keys(config.commands);
  const allTabs = [...commandNames, ABOUT_TAB];
  const [activeTab, setActiveTab] = useState(0); // start on first command
  const [scrollOffset, setScrollOffset] = useState(0); // lines scrolled up from the "anchor"
  const [following, setFollowing] = useState(true);
  const [pausedAtLine, setPausedAtLine] = useState(0); // total line count when paused
  const [interactive, setInteractive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [wrapLines, setWrapLines] = useState(true);

  const {
    getTab,
    startProcess,
    stopProcess,
    restartProcess,
    clearOutput,
    writeToProcess,
    killAll,
  } = useProcesses(config);

  // Disable mouse tracking in interactive mode so escape sequences
  // don't get forwarded to the PTY process
  useEffect(() => {
    if (interactive) {
      mouse.disable();
    } else {
      mouse.enable();
    }
  }, [interactive]);

  // Height available for output lines inside the bordered box
  // Total height - tab bar (1) - border top/bottom (2) - hotkey bar (1) = height - 4
  const outputHeight = height - 4;

  const activeTabName = allTabs[activeTab];
  const isAboutTab = activeTabName === ABOUT_TAB;
  const tab = isAboutTab ? null : getTab(activeTabName);

  // Reset scroll, following, and interactive mode when switching tabs
  useEffect(() => {
    setScrollOffset(0);
    setFollowing(true);
    setInteractive(false);
    setPausedAtLine(0);
    setPaused(false);
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

    // Enter interactive mode (only on process tabs)
    if (input === "i" && !isAboutTab) {
      if (tab && (tab.status === "running" || tab.status === "starting")) {
        setInteractive(true);
        setFollowing(true);
        setScrollOffset(0);
      }
      return;
    }

    // Tab switching with arrow keys
    if (key.leftArrow) {
      setActiveTab((i) => (i > 0 ? i - 1 : allTabs.length - 1));
    }
    if (key.rightArrow) {
      setActiveTab((i) => (i < allTabs.length - 1 ? i + 1 : 0));
    }

    // Tab switching with number keys
    const num = parseInt(input, 10);
    if (num >= 1 && num <= allTabs.length) {
      setActiveTab(num - 1);
    }

    // Scroll up
    if (key.upArrow) {
      if (following && tab) {
        // Snapshot line count when leaving follow mode via scroll
        setPausedAtLine(tab.output.length);
      }
      setFollowing(false);
      setScrollOffset((prev) => prev + 1);
    }

    // Scroll down
    if (key.downArrow) {
      setScrollOffset((prev) => {
        const next = Math.max(0, prev - 1);
        if (next === 0) {
          setFollowing(true);
          setPausedAtLine(0);
        }
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
      setPausedAtLine(0);
    }

    // Pause — freeze view at current position (toggle)
    if (input === "p") {
      if (!paused) {
        if (tab) {
          setPausedAtLine(tab.output.length);
          setScrollOffset(0);
        }
        setFollowing(false);
        setPaused(true);
      } else {
        setFollowing(true);
        setScrollOffset(0);
        setPausedAtLine(0);
        setPaused(false);
      }
    }

    // Follow toggle
    if (input === "f") {
      if (following) {
        setFollowing(false);
      } else {
        setFollowing(true);
        setScrollOffset(0);
        setPausedAtLine(0);
        setPaused(false);
      }
    }

    // Log-mode hotkeys
    const activeConfig = config.commands[activeTabName];
    if (activeConfig?.type === "log") {
      // Toggle line wrapping
      if (input === "w") {
        setWrapLines((prev) => !prev);
      }

      // Truncate/clear log output
      if (input === "t") {
        clearOutput(activeTabName);
        setScrollOffset(0);
        setFollowing(true);
      }
    }
  });

  // Compute visible lines
  let visibleLines: string[] = [];
  if (tab) {
    const allLines = tab.output;
    const totalLines = allLines.length;

    if (following) {
      // Show the last outputHeight lines (auto-scroll to bottom)
      const start = Math.max(0, totalLines - outputHeight);
      visibleLines = allLines.slice(start, start + outputHeight);
    } else {
      // When paused, anchor to the line count at the moment of pause
      // so new output doesn't push the view down
      const anchor = pausedAtLine > 0 ? Math.min(pausedAtLine, totalLines) : totalLines;
      const end = Math.max(0, anchor - scrollOffset);
      const start = Math.max(0, end - outputHeight);
      visibleLines = allLines.slice(start, end);
      // Clamp scrollOffset so we don't scroll past the top
      const maxOffset = Math.max(0, anchor - outputHeight);
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

  const isLogTab = !isAboutTab && config.commands[activeTabName]?.type === "log";

  const showStartPrompt =
    tab && (tab.status === "idle" || tab.status === "stopped") && tab.output.length === 0;

  return (
    <FullScreen>
      <Box flexDirection="column" height={height} width={width}>
        {/* Tab Bar */}
        <Box>
          {allTabs.map((name, i) => {
            if (name === ABOUT_TAB) {
              return (
                <TabButton
                  key="about"
                  name="About"
                  index={i}
                  isActive={i === activeTab}
                  dotColor="cyan"
                  onClick={() => setActiveTab(i)}
                />
              );
            }
            const t = getTab(name);
            const dotColor =
              t?.status === "running"
                ? "green"
                : t?.status === "stopped" || t?.status === "errored"
                  ? "red"
                  : "gray";
            return (
              <TabButton
                key={name}
                name={name}
                index={i}
                isActive={i === activeTab}
                dotColor={dotColor}
                onClick={() => setActiveTab(i)}
              />
            );
          })}
          <Box flexGrow={1} justifyContent="flex-end">
            <Text color={isAboutTab ? "cyan" : statusColor}>{isAboutTab ? "muxi" : tab?.status ?? "unknown"}</Text>
            {interactive && <Text color="magenta"> [INTERACTIVE]</Text>}
            {!interactive && following && <Text color="green"> [FOLLOWING]</Text>}
            {!interactive && paused && <Text color="yellow"> [PAUSED]</Text>}
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
          {isAboutTab ? (
            <AboutPane width={width - 2} height={outputHeight} />
          ) : showStartPrompt ? (
            <Box flexGrow={1} alignItems="center" justifyContent="center">
              <Text color="gray">
                Press <Text color="yellow">[s]</Text> to start
              </Text>
            </Box>
          ) : isLogTab ? (
            <LogTailPane
              lines={tab?.output ?? []}
              height={outputHeight}
              width={width - 2}
              scrollOffset={following ? 0 : scrollOffset}
              wrap={wrapLines}
            />
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
              {following ? (
                <><Text>un</Text><Text color="yellow">[f]</Text><Text>ollow </Text></>
              ) : (
                <><Text color="yellow">[f]</Text><Text>ollow </Text></>
              )}
              {isLogTab && (
                <>
                  <Text color="yellow">[w]</Text>
                  <Text>rap </Text>
                  <Text color="yellow">[t]</Text>
                  <Text>runcate </Text>
                </>
              )}
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
