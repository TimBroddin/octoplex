import React, { useEffect, useState } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import type { NormalizedConfig } from "./config";

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

  useInput((input, key) => {
    // Quit
    if (input === "q") {
      exit();
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
  });

  return (
    <FullScreen>
      <Box flexDirection="column" height={height} width={width}>
        {/* Tab Bar */}
        <Box>
          {tabNames.map((name, i) => (
            <Box key={name} marginRight={1}>
              <Text
                bold={i === activeTab}
                color={i === activeTab ? "cyan" : "gray"}
                inverse={i === activeTab}
              >
                {` ${i + 1}:${name} `}
              </Text>
            </Box>
          ))}
        </Box>

        {/* Output Pane */}
        <Box flexDirection="column" flexGrow={1} overflow="hidden" borderStyle="single" borderColor="gray">
          <Text color="gray">
            Tab: {tabNames[activeTab]} — output will appear here
          </Text>
        </Box>

        {/* Hotkey Bar */}
        <Box>
          <Text>
            <Text color="yellow">[s]</Text><Text>tart/stop </Text>
            <Text color="yellow">[r]</Text><Text>estart </Text>
            <Text color="yellow">[c]</Text><Text>lear </Text>
            <Text color="yellow">[p]</Text><Text>ause </Text>
            <Text color="yellow">[←→]</Text><Text> tabs </Text>
            <Text color="yellow">[↑↓]</Text><Text> scroll </Text>
            <Text color="yellow">[q]</Text><Text>uit</Text>
          </Text>
        </Box>
      </Box>
    </FullScreen>
  );
}
