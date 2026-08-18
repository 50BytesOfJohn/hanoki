import { SerializeAddon } from "@xterm/addon-serialize";
import { Terminal } from "@xterm/headless";

const SCROLLBACK_LINES = 10_000;

export class TerminalState {
  readonly #terminal: Terminal;
  readonly #serializer: SerializeAddon;
  #pendingWrites = 0;
  #idleResolvers = new Set<() => void>();

  constructor(columns: number, rows: number) {
    this.#terminal = new Terminal({
      allowProposedApi: true,
      cols: columns,
      rows,
      scrollback: SCROLLBACK_LINES,
    });
    this.#serializer = new SerializeAddon();
    this.#terminal.loadAddon(this.#serializer);
  }

  write(data: string, onParsed?: () => void): void {
    if (!data) return;
    this.#pendingWrites += 1;
    this.#terminal.write(data, () => {
      this.#pendingWrites -= 1;
      onParsed?.();
      if (this.#pendingWrites !== 0) return;
      for (const resolve of this.#idleResolvers) resolve();
      this.#idleResolvers.clear();
    });
  }

  resize(columns: number, rows: number): void {
    this.#terminal.resize(columns, rows);
  }

  async whenIdle(): Promise<void> {
    if (this.#pendingWrites === 0) return;
    await new Promise<void>((resolve) => this.#idleResolvers.add(resolve));
  }

  serializeForLiveSession(): string {
    return this.#serializer.serialize({ scrollback: SCROLLBACK_LINES });
  }

  serializeForRestart(): string {
    return this.#serializer.serialize({
      scrollback: SCROLLBACK_LINES,
      excludeAltBuffer: true,
      excludeModes: true,
    });
  }

  dispose(): void {
    this.#terminal.dispose();
  }
}
