import { useCallback, useEffect, useRef, useState } from "react";
import { useKeyboard } from "@opentui/react";
import { TextAttributes } from "@opentui/core";
import type { InputRenderable } from "@opentui/core";
import { useKeyboardLayer } from "../providers/keyboard-layer";
import { useTheme } from "../providers/theme";

type Mode = "BUILD" | "PLAN" | "REVIEW" | "SCAN" | "FIX";

type Props = {
  onSubmit: (value: string) => void;
  onCommand?: (command: string) => void;
  onSlashCommand?: () => void;
  disabled?: boolean;
  placeholder?: string;
  mode?: Mode;
  onModeToggle?: () => void;
  onCommandPalette?: () => void;
};

const MAX_SUGGESTIONS = 20;
const LARGE_PROJECT_THRESHOLD = 1000;
const MENTION_LAYER_ID = "mention-list";
const MENTION_REGEX = /(?:^|\s)@([^\s@]*)$/;
const REPLACE_REGEX = /^(.*?)(@[^\s@]*)$/;

function extractMentionToken(text: string): string | null {
  const match = text.match(MENTION_REGEX);
  return match ? match[1] : null;
}

function filterFiles(files: string[], token: string, limit: number): string[] {
  if (!token) return files.slice(0, limit);
  const lower = token.toLowerCase();
  const out: string[] = [];
  for (const file of files) {
    if (file.toLowerCase().includes(lower)) {
      out.push(file);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export function InputBar({
  onSubmit,
  onCommand,
  onSlashCommand,
  disabled = false,
  placeholder = "Ask Sentinel to do anything...",
  mode = "BUILD",
  onModeToggle,
  onCommandPalette,
}: Props) {
  const inputRef = useRef<InputRenderable>(null);
  const { colors } = useTheme();
  const { isTopLayer, push, pop } = useKeyboardLayer();

  const [value, setValue] = useState("");
  const [mentionToken, setMentionToken] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const cachedFilesRef = useRef<string[] | null>(null);
  const isLargeProjectRef = useRef(false);
  const layerPushedRef = useRef(false);

  const closeMentionList = useCallback(() => {
    if (layerPushedRef.current) {
      pop(MENTION_LAYER_ID);
      layerPushedRef.current = false;
    }
    setMentionToken(null);
    setSuggestions([]);
    setSelectedIndex(0);
  }, [pop]);

  useEffect(() => {
    return () => {
      if (layerPushedRef.current) {
        pop(MENTION_LAYER_ID);
        layerPushedRef.current = false;
      }
    };
  }, [pop]);

  useEffect(() => {
    if (mentionToken === null) {
      if (layerPushedRef.current) {
        pop(MENTION_LAYER_ID);
        layerPushedRef.current = false;
      }
      return;
    }
    if (!layerPushedRef.current) {
      push(MENTION_LAYER_ID);
      layerPushedRef.current = true;
    }

    let cancelled = false;
    const sanitizedToken = mentionToken.replace(/[*?[\]]/g, "");

    (async () => {
      try {
        const { executeLocalTool } = await import("../../shared/tools/index.js");
        const cached = cachedFilesRef.current;

        if (cached !== null && !isLargeProjectRef.current) {
          if (cancelled) return;
          setSuggestions(filterFiles(cached, mentionToken, MAX_SUGGESTIONS));
          setSelectedIndex(0);
          return;
        }

        if (isLargeProjectRef.current) {
          const pattern = sanitizedToken.length > 0 ? `**/*${sanitizedToken}*` : "**/*";
          const result = await executeLocalTool("glob", { pattern });
          if (cancelled) return;
          const files: string[] = Array.isArray(result?.files) ? result.files : [];
          setSuggestions(files.slice(0, MAX_SUGGESTIONS));
          setSelectedIndex(0);
          return;
        }

        const initial = await executeLocalTool("glob", { pattern: "**/*" });
        if (cancelled) return;
        const files: string[] = Array.isArray(initial?.files) ? initial.files : [];
        if (initial?.truncated || files.length >= LARGE_PROJECT_THRESHOLD) {
          isLargeProjectRef.current = true;
          const pattern = sanitizedToken.length > 0 ? `**/*${sanitizedToken}*` : "**/*";
          const lazyResult = await executeLocalTool("glob", { pattern });
          if (cancelled) return;
          const lazyFiles: string[] = Array.isArray(lazyResult?.files) ? lazyResult.files : [];
          setSuggestions(lazyFiles.slice(0, MAX_SUGGESTIONS));
          setSelectedIndex(0);
          return;
        }

        cachedFilesRef.current = files;
        setSuggestions(filterFiles(files, mentionToken, MAX_SUGGESTIONS));
        setSelectedIndex(0);
      } catch {
        if (!cancelled) {
          setSuggestions([]);
          setSelectedIndex(0);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mentionToken, push, pop]);

  const handleInput = useCallback((next: unknown) => {
    const text = String(next);
    setValue(text);
    setMentionToken(extractMentionToken(text));
  }, [onSlashCommand]);

  const insertSelected = useCallback(() => {
    if (mentionToken === null || suggestions.length === 0) return;
    const selected = suggestions[selectedIndex];
    if (!selected) return;
    const match = value.match(REPLACE_REGEX);
    const nextValue = match ? `${match[1]}@${selected} ` : `${value}@${selected} `;
    if (inputRef.current) {
      inputRef.current.value = nextValue;
    }
    setValue(nextValue);
    closeMentionList();
  }, [mentionToken, suggestions, selectedIndex, value, closeMentionList]);

  const handleSubmit = useCallback(
    (submittedValue: unknown) => {
      if (mentionToken !== null && suggestions.length > 0) {
        insertSelected();
        return;
      }
      const trimmed = String(submittedValue).trim();
      if (trimmed.length === 0) return;

      if (trimmed.startsWith("/")) {
        if (onSlashCommand) {
          onSlashCommand();
          return;
        }
        if (onCommand) {
          onCommand(trimmed);
          return;
        }
        onSubmit(trimmed);
        return;
      }
      onSubmit(trimmed);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      setValue("");
      closeMentionList();
    },
    [onSubmit, onCommand, onSlashCommand, mentionToken, suggestions, insertSelected, closeMentionList]
  );

  const activeColor = mode === "PLAN" ? colors.planMode : colors.primary;
  const showSuggestions = mentionToken !== null && suggestions.length > 0;

  useKeyboard((key) => {
    if (showSuggestions && isTopLayer(MENTION_LAYER_ID)) {
      if (key.name === "up") {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.name === "down") {
        setSelectedIndex((prev) => Math.min(suggestions.length - 1, prev + 1));
        return;
      }
      if (key.name === "tab") {
        insertSelected();
        return;
      }
      if (key.name === "escape") {
        closeMentionList();
        return;
      }
      return;
    }
    if (!isTopLayer("dialog") && !isTopLayer("command-menu")) {
      return;
    }
    if (key.name === "tab") {
      onModeToggle?.();
      return;
    }
    if (key.name === "p" && key.ctrl) {
      onCommandPalette?.();
    }
  });

  return (
    <box flexDirection="column" width="100%">
      {showSuggestions ? (
        <box
          flexDirection="column"
          backgroundColor={colors.dialogSurface}
          paddingX={1}
          width="100%"
        >
          {suggestions.map((filePath, i) => {
            const isSelected = i === selectedIndex;
            return (
              <text
                key={filePath}
                fg={isSelected ? colors.primary : colors.info}
                attributes={isSelected ? TextAttributes.BOLD : TextAttributes.DIM}
              >
                {isSelected ? "> " : "  "}
                {filePath}
              </text>
            );
          })}
        </box>
      ) : null}
      <box flexDirection="row" width="100%" alignItems="center">
        <text fg={activeColor}>{"\u276F"} </text>
        <input
          ref={inputRef}
          placeholder={disabled ? "Processing..." : placeholder}
          focused={!disabled}
          flexGrow={1}
          onInput={handleInput}
          onSubmit={handleSubmit}
        />
      </box>
    </box>
  );
}
