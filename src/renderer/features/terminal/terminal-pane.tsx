import * as React from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

import { terminalsApi } from "@/api/terminals";
import type { TerminalEvent } from "@shared/ipc";

export function TerminalPane({ itemId }: { itemId: string }) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const styles = getComputedStyle(document.documentElement);
    const terminal = new Terminal({
      allowProposedApi: false,
      allowTransparency: true,
      cursorBlink: true,
      cursorStyle: "bar",
      fontFamily: '"Geist Mono Variable", "SFMono-Regular", Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: 10_000,
      theme: {
        background: "#00000000",
        foreground: styles.getPropertyValue("--foreground").trim(),
        cursor: styles.getPropertyValue("--focus").trim(),
        selectionBackground: "#6b8f744d",
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);

    let ready = false;
    let forwardInputToPty = false;
    let disposed = false;
    const queued: TerminalEvent[] = [];
    const unsubscribe = window.electronAPI.onTerminalEvent((event) => {
      if (event.itemId !== itemId || disposed) return;
      if (!ready) {
        queued.push(event);
        return;
      }
      if (event.type === "data") terminal.write(event.data);
    });

    const dataDisposable = terminal.onData((data) => {
      // `onData` also carries protocol replies generated while parsing PTY output. During
      // snapshot replay those replies belong to the old process and must never reach the new one.
      if (!forwardInputToPty) return;
      void terminalsApi.write(itemId, data);
    });
    const resizeDisposable = terminal.onResize(({ cols, rows }) => {
      void terminalsApi.resize(itemId, cols, rows);
    });
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown" || !event.metaKey) return true;
      if (event.key.toLowerCase() === "c" && terminal.hasSelection()) {
        void navigator.clipboard.writeText(terminal.getSelection());
        return false;
      }
      if (event.key.toLowerCase() === "v") {
        void navigator.clipboard.readText().then((text) => terminalsApi.write(itemId, text));
        return false;
      }
      return true;
    });

    const resizeObserver = new ResizeObserver(() => {
      if (container.clientWidth > 0 && container.clientHeight > 0) fit.fit();
    });
    resizeObserver.observe(container);
    if (container.clientWidth > 0 && container.clientHeight > 0) fit.fit();

    void terminalsApi
      .start(itemId)
      .then((session) => {
        if (disposed) return;
        terminal.write(session.scrollback, () => {
          forwardInputToPty = true;
          ready = true;
          for (const event of queued) {
            if (event.sequence > session.sequence && event.type === "data") {
              terminal.write(event.data);
            }
          }
          queued.length = 0;
          terminal.focus();
        });
      })
      .catch((error) => {
        if (!disposed) {
          terminal.writeln(
            `\r\n\x1b[31m${error instanceof Error ? error.message : "Terminal failed to start."}\x1b[0m`,
          );
        }
      });

    return () => {
      disposed = true;
      unsubscribe();
      resizeObserver.disconnect();
      dataDisposable.dispose();
      resizeDisposable.dispose();
      terminal.dispose();
    };
  }, [itemId]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Terminal"
      className="h-full min-h-0 w-full overflow-hidden bg-surface px-2 py-1.5 [&_.xterm]:h-full [&_.xterm-viewport]:!bg-transparent"
      onPointerDown={() =>
        containerRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus()
      }
    />
  );
}
