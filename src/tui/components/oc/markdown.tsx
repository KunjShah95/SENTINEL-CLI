/**
 * Small streaming-safe Markdown renderer for Ink, colored with opencode's
 * markdown* theme tokens. Handles headings, lists, quotes, rules, fenced
 * code and inline `code` / **bold** / *emph* / [links](url). An unclosed
 * fence (mid-stream) renders as code until it closes.
 */
import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../providers/theme/index.js";
import type { ThemeColors } from "../../theme.js";

type Span = { text: string; kind: "plain" | "code" | "strong" | "emph" | "link" };

export function parseInline(line: string): Span[] {
  const out: Span[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))|(\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) out.push({ text: line.slice(last, m.index), kind: "plain" });
    const t = m[0];
    if (m[1]) out.push({ text: t.slice(1, -1), kind: "code" });
    else if (m[2]) out.push({ text: t.slice(2, -2), kind: "strong" });
    else if (m[3]) out.push({ text: t.slice(1, t.indexOf("]")), kind: "link" });
    else out.push({ text: t.slice(1, -1), kind: "emph" });
    last = m.index + t.length;
  }
  if (last < line.length) out.push({ text: line.slice(last), kind: "plain" });
  return out;
}

function Inline({ text, colors, base }: { text: string; colors: ThemeColors; base?: string }) {
  return (
    <Text color={base ?? colors.text} wrap="wrap">
      {parseInline(text).map((s, i) => {
        if (s.kind === "code") return <Text key={i} color={colors.markdownCode}>{s.text}</Text>;
        if (s.kind === "strong") return <Text key={i} bold color={colors.markdownStrong}>{s.text}</Text>;
        if (s.kind === "emph") return <Text key={i} italic>{s.text}</Text>;
        if (s.kind === "link") return <Text key={i} underline color={colors.markdownLink}>{s.text}</Text>;
        return <Text key={i}>{s.text}</Text>;
      })}
    </Text>
  );
}

export type MdBlock =
  | { type: "p"; text: string }
  | { type: "h"; level: number; text: string }
  | { type: "li"; marker: string; indent: number; text: string }
  | { type: "quote"; text: string }
  | { type: "hr" }
  | { type: "code"; lang: string; lines: string[] }
  | { type: "blank" };

export function parseMarkdown(src: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  const lines = src.replace(/\r/g, "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*```(\S*)/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      // Unclosed (still streaming): drop the trailing empty line(s).
      if (i >= lines.length) while (body.length && !body[body.length - 1].trim()) body.pop();
      blocks.push({ type: "code", lang: fence[1], lines: body });
      continue;
    }
    if (!line.trim()) { blocks.push({ type: "blank" }); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { blocks.push({ type: "h", level: h[1].length, text: h[2] }); continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { blocks.push({ type: "hr" }); continue; }
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) { blocks.push({ type: "li", indent: Math.floor(li[1].length / 2), marker: /\d/.test(li[2]) ? li[2] : "•", text: li[3] }); continue; }
    const qm = /^\s*>\s?(.*)$/.exec(line);
    if (qm) { blocks.push({ type: "quote", text: qm[1] }); continue; }
    blocks.push({ type: "p", text: line });
  }
  // Collapse runs of blank lines.
  return blocks.filter((b, i) => !(b.type === "blank" && (i === 0 || blocks[i - 1].type === "blank")));
}

export function Markdown({ text }: { text: string }) {
  const { colors } = useTheme();
  const blocks = parseMarkdown(text);
  return (
    <Box flexDirection="column">
      {blocks.map((b, i) => {
        switch (b.type) {
        case "blank": return <Text key={i}> </Text>;
        case "h": return <Text key={i} bold color={colors.markdownHeading}>{b.text}</Text>;
        case "hr": return <Text key={i} color={colors.border}>{"─".repeat(40)}</Text>;
        case "quote":
          return (
            <Box key={i} flexDirection="row">
              <Text color={colors.markdownBlockQuote}>{"┃ "}</Text>
              <Inline text={b.text} colors={colors} base={colors.textMuted} />
            </Box>
          );
        case "li":
          return (
            <Box key={i} flexDirection="row" paddingLeft={b.indent * 2}>
              <Box flexShrink={0} marginRight={1}><Text color={colors.markdownListItem}>{b.marker}</Text></Box>
              <Inline text={b.text} colors={colors} />
            </Box>
          );
        case "code":
          return (
            <Box key={i} flexDirection="column" paddingLeft={2} paddingY={0} backgroundColor={colors.backgroundPanel}>
              {b.lang ? <Text color={colors.textMuted}>{b.lang}</Text> : null}
              {b.lines.map((l, j) => <Text key={j} color={colors.markdownCode}>{l || " "}</Text>)}
            </Box>
          );
        default: return <Inline key={i} text={b.text} colors={colors} />;
        }
      })}
    </Box>
  );
}
