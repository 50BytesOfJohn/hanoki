import type { Hotkey } from "@tanstack/react-hotkeys";

/** Shortcuts shared by the composer, the picker and the model library. */
export const MODEL_PICKER_HOTKEYS = {
  /** Composer: open the picker. */
  open: "Mod+/",
  /** Composer: open the effort slider. */
  openEffort: "Mod+Shift+E",
  /** Picker: open the effort slider for the highlighted model. */
  editRowEffort: "Mod+E",
  /** Picker and library: pin or unpin the highlighted model. */
  togglePin: "Mod+P",
  /** Picker: hide the highlighted model, or forget a recent pair. */
  hide: "Mod+Backspace",
  /** Picker: open the model library. */
  openLibrary: "Mod+Shift+M",
} as const satisfies Record<string, Hotkey>;

/** Picker: Mod+1…9 picks the pinned model in that position. */
export const PINNED_SLOT_HOTKEYS = [
  "Mod+1",
  "Mod+2",
  "Mod+3",
  "Mod+4",
  "Mod+5",
  "Mod+6",
  "Mod+7",
  "Mod+8",
  "Mod+9",
] as const satisfies readonly Hotkey[];

/** Composer: Mod+Alt+N lights N effort bars; 0 is Off. */
export const EFFORT_LEVEL_HOTKEYS = [
  "Mod+Alt+0",
  "Mod+Alt+1",
  "Mod+Alt+2",
  "Mod+Alt+3",
  "Mod+Alt+4",
  "Mod+Alt+5",
  "Mod+Alt+6",
] as const satisfies readonly Hotkey[];

/** Picker: Alt+N lights N bars on the highlighted row. */
export const ROW_EFFORT_HOTKEYS = [
  "Alt+0",
  "Alt+1",
  "Alt+2",
  "Alt+3",
  "Alt+4",
  "Alt+5",
  "Alt+6",
] as const satisfies readonly Hotkey[];
