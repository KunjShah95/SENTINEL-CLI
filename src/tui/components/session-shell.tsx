import type { ReactNode } from 'react';
import { InputBar } from './input-bar';
import { Spinner } from './spinner';
import { StatusBar } from './status-bar';

type Mode = 'BUILD' | 'PLAN' | 'REVIEW' | 'SCAN' | 'FIX';

type Props = {
  children: ReactNode;
  onSubmit: (value: string) => void;
  onCommand?: (command: string) => void;
  onSlashCommand?: () => void;
  inputDisabled?: boolean;
  loading?: boolean;
  mode?: Mode;
  onModeToggle?: () => void;
  onCommandPalette?: () => void;
  model?: string;
  statusText?: string;
};

export function SessionShell({
  children,
  onSubmit,
  onCommand,
  onSlashCommand,
  inputDisabled = false,
  loading = false,
  mode = 'BUILD',
  onModeToggle,
  onCommandPalette,
  model,
  statusText,
}: Props) {
  return (
    <box
      flexDirection="column"
      flexGrow={1}
      width="100%"
      height="100%"
      paddingY={1}
      paddingX={2}
      gap={1}
    >
      <scrollbox flexGrow={1} width="100%" stickyScroll stickyStart="bottom">
        <box flexDirection="column">
          {(() => {
            const c: any = children;
            if (c == null) return null;
            if (typeof c === 'string' || typeof c === 'number') return <text>{c}</text>;
            if (Array.isArray(c))
              return c.map((item, i) =>
                typeof item === 'string' || typeof item === 'number' ? (
                  <text key={i}>{item}</text>
                ) : (
                  item
                )
              );
            return c;
          })()}
        </box>
      </scrollbox>
      {loading ? (
        <box flexShrink={0} paddingLeft={1}>
          <Spinner mode={mode} />
        </box>
      ) : null}
      <box flexShrink={0}>
        <InputBar
          onSubmit={onSubmit}
          onCommand={onCommand}
          onSlashCommand={onSlashCommand}
          disabled={inputDisabled}
          mode={mode}
          onModeToggle={onModeToggle}
          onCommandPalette={onCommandPalette}
        />
      </box>
      <box
        flexShrink={0}
        flexDirection="row"
        justifyContent="space-between"
        width="100%"
        height={1}
        gap={2}
        paddingLeft={1}
      >
        <StatusBar mode={mode} model={model} statusText={statusText} />
        <box flexDirection="row" gap={1}>
          <text>Tab: Mode | Ctrl+P: Commands</text>
        </box>
      </box>
    </box>
  );
}
