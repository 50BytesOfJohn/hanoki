import type * as React from "react";

import { cn } from "@/lib/utils";
import { WINDOW_TOOLBAR_HEIGHT, WINDOW_TRAFFIC_LIGHTS_SPACER } from "@shared/window-chrome";

const windowToolbarInteractiveSelectors = cn(
  "[-webkit-app-region:drag]",
  "[&_a]:[-webkit-app-region:no-drag]",
  "[&_button]:[-webkit-app-region:no-drag]",
  "[&_input]:[-webkit-app-region:no-drag]",
  "[&_label]:[-webkit-app-region:no-drag]",
  "[&_select]:[-webkit-app-region:no-drag]",
  "[&_textarea]:[-webkit-app-region:no-drag]",
  "[&_summary]:[-webkit-app-region:no-drag]",
  "[&_[contenteditable='true']]:[-webkit-app-region:no-drag]",
  "[&_[role='button']]:[-webkit-app-region:no-drag]",
  "[&_[role='checkbox']]:[-webkit-app-region:no-drag]",
  "[&_[role='combobox']]:[-webkit-app-region:no-drag]",
  "[&_[role='link']]:[-webkit-app-region:no-drag]",
  "[&_[role='menuitem']]:[-webkit-app-region:no-drag]",
  "[&_[role='option']]:[-webkit-app-region:no-drag]",
  "[&_[role='radio']]:[-webkit-app-region:no-drag]",
  "[&_[role='slider']]:[-webkit-app-region:no-drag]",
  "[&_[data-window-no-drag]]:[-webkit-app-region:no-drag]",
);

type WindowChromeProps = {
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
};

export function WindowChrome({
  toolbar,
  children,
  className,
  contentClassName,
}: WindowChromeProps) {
  const chromeStyle = {
    "--window-toolbar-height": `${WINDOW_TOOLBAR_HEIGHT}px`,
    "--window-traffic-lights-spacer": `${WINDOW_TRAFFIC_LIGHTS_SPACER}px`,
  } as React.CSSProperties;

  return (
    <div
      className={cn("flex min-h-0 flex-col h-full w-full", className)}
      data-slot="window-chrome"
      style={chromeStyle}
    >
      <header
        className="relative isolate h-(--window-toolbar-height) shrink-0 w-full"
        data-slot="window-chrome-toolbar"
      >
        <div className="absolute inset-0 [-webkit-app-region:drag]" />
        <div className="pointer-events-none relative z-10 flex h-full items-center px-2 w-full">
          <div
            aria-hidden
            className="shrink-0"
            style={{ width: "var(--window-traffic-lights-spacer)" }}
          />
          {toolbar ? (
            <div
              className={cn(
                "pointer-events-auto max-w-full w-full",
                windowToolbarInteractiveSelectors,
              )}
            >
              {toolbar}
            </div>
          ) : null}
        </div>
      </header>

      <main
        className={cn("min-h-0 h-full scrollbar w-full overflow-auto", contentClassName)}
        data-slot="window-chrome-content"
      >
        {children}
      </main>
    </div>
  );
}
