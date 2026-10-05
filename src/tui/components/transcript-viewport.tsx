import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box } from 'ink';

/**
 * Scrolling transcript viewport.
 *
 * Ink gives no scroll primitive, so this measures the real laid-out height of
 * the transcript with the Yoga node Ink hands to a Box ref, then shifts the
 * content up with a negative margin inside a clipping box. Measuring beats
 * estimating: a message's height depends on how its markdown wraps, which no
 * amount of counting can predict.
 *
 * `scrollFromBottom` is how far the user has scrolled *up* from the live edge.
 * Zero means follow the tail, so streaming keeps filling the view on its own,
 * and a message that arrives while you are reading history leaves your place.
 */
export type TranscriptViewportProps = {
  children: ReactNode;
  /** Lines scrolled up from the bottom. 0 = following the tail. */
  scrollFromBottom: number;
  /** Fired with the furthest possible scroll, so callers can clamp and "jump to top" works. */
  onMaxOffset?: (max: number) => void;
  /** Fired with the viewport height, so page-sized scrolling can be sized to it. */
  onRows?: (rows: number) => void;
};

/** Layout height of an Ink Box ref, or 0 before the first layout pass. */
function measuredHeight(ref: { current: any } | null): number {
  const node = ref?.current?.yogaNode;
  if (!node || typeof node.getComputedLayout !== 'function') return 0;
  const h = node.getComputedLayout?.().height;
  return typeof h === 'number' && Number.isFinite(h) ? h : 0;
}

export function TranscriptViewport({ children, scrollFromBottom, onMaxOffset, onRows }: TranscriptViewportProps) {
  const outerRef = useRef<any>(null);
  const innerRef = useRef<any>(null);
  const [dims, setDims] = useState({ rows: 0, content: 0 });

  // Measure after every commit: message heights change as text streams in, as
  // markdown rewraps, and when the terminal is resized.
  useEffect(() => {
    const rows = measuredHeight(outerRef);
    const content = measuredHeight(innerRef);
    setDims((prev) => (prev.rows === rows && prev.content === content ? prev : { rows, content }));
  });

  const maxOffset = Math.max(0, dims.content - dims.rows);

  useEffect(() => {
    if (maxOffset > 0) onMaxOffset?.(maxOffset);
  }, [maxOffset]);

  useEffect(() => {
    if (dims.rows > 0) onRows?.(dims.rows);
  }, [dims.rows]);

  // Offset is how much is hidden above the viewport. Pinned to the bottom means
  // hiding everything above; scrolled up means hiding less.
  const offset = Math.max(0, Math.min(maxOffset, maxOffset - scrollFromBottom));

  return (
    <Box ref={outerRef} flexGrow={1} width="100%" flexDirection="column" overflow="hidden">
      <Box ref={innerRef} flexDirection="column" width="100%" flexShrink={0} marginTop={-offset}>
        {children}
      </Box>
    </Box>
  );
}