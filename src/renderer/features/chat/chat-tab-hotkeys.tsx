import { useHotkey } from "@tanstack/react-hotkeys";
import { useWorkspaceStore } from "../workspace/store";

/**
 * Registers keyboard shortcuts for tab management.
 * Renders nothing — mount once inside ChatLayout.
 *
 * Shortcuts:
 *  Ctrl+Tab      — cycle to the next open tab
 *  Mod+W         — close the active tab  (Cmd+W / Ctrl+W)
 *  Mod+T         — open a new empty tab  (Cmd+T / Ctrl+T)
 *  Mod+1..9      — switch to the tab at that 1-based index
 */
export function ChatTabHotkeys() {
  const tabs = useWorkspaceStore((s) => s.tabs);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const activeTab = useWorkspaceStore((s) => s.activeTab());
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const openTab = useWorkspaceStore((s) => s.openTab);

  // Ctrl+Tab → cycle forward through open tabs
  useHotkey("Control+Tab", (e) => {
    if (tabs.length < 2) return;
    e.preventDefault();
    const currentIdx = tabs.findIndex((t) => t.id === activeTabId);
    const nextIdx = (currentIdx + 1) % tabs.length;
    setActiveTab(tabs[nextIdx].id);
  });

  // Mod+W → close active tab
  useHotkey("Mod+W", (e) => {
    e.preventDefault();
    if (activeTab) closeTab(activeTab.id);
  });

  // Mod+T → open a new empty tab
  useHotkey("Mod+T", (e) => {
    e.preventDefault();
    openTab({ type: "empty" });
  });

  // Mod+1..9 → switch to tab at the given 1-based index
  useHotkey("Mod+1", (e) => {
    e.preventDefault();
    if (tabs[0]) setActiveTab(tabs[0].id);
  });
  useHotkey("Mod+2", (e) => {
    e.preventDefault();
    if (tabs[1]) setActiveTab(tabs[1].id);
  });
  useHotkey("Mod+3", (e) => {
    e.preventDefault();
    if (tabs[2]) setActiveTab(tabs[2].id);
  });
  useHotkey("Mod+4", (e) => {
    e.preventDefault();
    if (tabs[3]) setActiveTab(tabs[3].id);
  });
  useHotkey("Mod+5", (e) => {
    e.preventDefault();
    if (tabs[4]) setActiveTab(tabs[4].id);
  });
  useHotkey("Mod+6", (e) => {
    e.preventDefault();
    if (tabs[5]) setActiveTab(tabs[5].id);
  });
  useHotkey("Mod+7", (e) => {
    e.preventDefault();
    if (tabs[6]) setActiveTab(tabs[6].id);
  });
  useHotkey("Mod+8", (e) => {
    e.preventDefault();
    if (tabs[7]) setActiveTab(tabs[7].id);
  });
  useHotkey("Mod+9", (e) => {
    e.preventDefault();
    if (tabs[8]) setActiveTab(tabs[8].id);
  });

  return null;
}
