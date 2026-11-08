"use client";

import * as React from "react";
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";
import type { StyledProps } from "../ui/styled-props";

import { cn } from "@/lib/utils";

interface DesktopSafeScrollAreaProps extends StyledProps<typeof ScrollAreaPrimitive.Root> {
  contentClassName?: string;
  contentStyle?: React.CSSProperties;
  scrollbarClassName?: string;
  thumbClassName?: string;
  viewportClassName?: string;
}

export function DesktopSafeScrollArea({
  children,
  className,
  contentClassName,
  contentStyle,
  onPointerEnter,
  onPointerLeave,
  onPointerMove,
  scrollbarClassName,
  thumbClassName,
  viewportClassName,
  ...props
}: DesktopSafeScrollAreaProps) {
  const [isScrollbarVisible, setIsScrollbarVisible] = React.useState(false);
  const hideScrollbarTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideScrollbarTimer = React.useCallback(() => {
    if (hideScrollbarTimer.current === null) {
      return;
    }

    clearTimeout(hideScrollbarTimer.current);
    hideScrollbarTimer.current = null;
  }, []);

  const showScrollbarTemporarily = React.useCallback(() => {
    clearHideScrollbarTimer();
    setIsScrollbarVisible(true);
    hideScrollbarTimer.current = setTimeout(() => {
      setIsScrollbarVisible(false);
      hideScrollbarTimer.current = null;
    }, 900);
  }, [clearHideScrollbarTimer]);

  const hideScrollbarSoon = React.useCallback(() => {
    clearHideScrollbarTimer();
    hideScrollbarTimer.current = setTimeout(() => {
      setIsScrollbarVisible(false);
      hideScrollbarTimer.current = null;
    }, 120);
  }, [clearHideScrollbarTimer]);

  React.useEffect(
    () => () => {
      clearHideScrollbarTimer();
    },
    [clearHideScrollbarTimer],
  );

  return (
    <ScrollAreaPrimitive.Root
      className={cn("relative min-h-0 min-w-0 overflow-hidden", className)}
      data-slot="desktop-safe-scroll-area"
      onPointerEnter={(event) => {
        showScrollbarTemporarily();
        onPointerEnter?.(event);
      }}
      onPointerLeave={(event) => {
        hideScrollbarSoon();
        onPointerLeave?.(event);
      }}
      onPointerMove={(event) => {
        showScrollbarTemporarily();
        onPointerMove?.(event);
      }}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        className={cn("isolate h-full w-full min-w-0", viewportClassName)}
        data-slot="desktop-safe-scroll-viewport"
        onScroll={showScrollbarTemporarily}
        style={{ overflowX: "hidden" }}
      >
        <ScrollAreaPrimitive.Content
          className={cn("min-w-0 w-full", contentClassName)}
          data-slot="desktop-safe-scroll-content"
          style={{ minWidth: 0, ...contentStyle }}
        >
          {children}
        </ScrollAreaPrimitive.Content>
      </ScrollAreaPrimitive.Viewport>

      <ScrollAreaPrimitive.Scrollbar
        className={cn(
          "app-no-drag z-20 flex w-2 touch-none select-none rounded-full p-px transition-opacity duration-150",
          isScrollbarVisible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
          scrollbarClassName,
        )}
        data-slot="desktop-safe-scrollbar"
        orientation="vertical"
        style={{
          bottom: "var(--desktop-window-safe-area-block)",
          right: 0,
          top: "var(--desktop-window-safe-area-block)",
        }}
      >
        <ScrollAreaPrimitive.Thumb
          className={cn(
            "relative flex-1 rounded-full bg-muted-foreground/30 hover:bg-muted-foreground/50",
            thumbClassName,
          )}
          data-slot="desktop-safe-scroll-thumb"
        />
      </ScrollAreaPrimitive.Scrollbar>
    </ScrollAreaPrimitive.Root>
  );
}
