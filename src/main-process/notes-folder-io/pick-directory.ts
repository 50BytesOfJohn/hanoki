import { homedir } from "node:os";
import { BrowserWindow, dialog, type OpenDialogOptions, type WebContents } from "electron";

export async function pickNotesFolder({
  sender,
  title,
  buttonLabel,
  defaultPath = homedir(),
}: {
  sender: WebContents;
  title: string;
  buttonLabel: string;
  defaultPath?: string;
}): Promise<string | null> {
  const options: OpenDialogOptions = {
    title,
    buttonLabel,
    defaultPath,
    properties: ["openDirectory", "createDirectory"],
  };
  const parentWindow = BrowserWindow.fromWebContents(sender);
  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, options)
    : await dialog.showOpenDialog(options);

  return result.canceled ? null : (result.filePaths[0] ?? null);
}
