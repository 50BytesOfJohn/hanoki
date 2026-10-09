import { externalUrlToOpen } from "@shared/external-url";

export function openExternalLink(url: string): void {
  if (!externalUrlToOpen(url)) return;
  void window.electronAPI.openExternal(url);
}

export function openExternalFromMouseEvent(event: MouseEvent): boolean {
  if (!(event.target instanceof Element)) return false;
  const anchor = event.target.closest("a");
  if (!(anchor instanceof HTMLAnchorElement)) return false;
  const href = anchor.getAttribute("href");
  if (!href || !externalUrlToOpen(href)) return false;
  event.preventDefault();
  openExternalLink(href);
  return true;
}
