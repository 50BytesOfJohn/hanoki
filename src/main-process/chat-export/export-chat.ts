import { writeFile } from "node:fs/promises";
import { BrowserWindow, dialog, type SaveDialogOptions, type WebContents } from "electron";

import {
  getChatExportFormat,
  type ChatExportFormat,
  type ChatExportResult,
} from "@shared/chat/chat-export";
import type { AppServices } from "../services";
import { renderChatAsHtml, serializeChatAsJson, serializeChatAsMarkdown } from "./serialize";

export async function exportChatToFile({
  services,
  sender,
  chatId,
  format,
}: {
  services: AppServices;
  sender: WebContents;
  chatId: string;
  format: ChatExportFormat;
}): Promise<ChatExportResult> {
  const chat = services.chatTree.getChat(chatId);
  const formatDefinition = getChatExportFormat(format);
  const options: SaveDialogOptions = {
    title: "Export chat",
    defaultPath: `${safeFileName(chat.title)}.${formatDefinition.extension}`,
    buttonLabel: "Export",
    filters: [
      {
        name: formatDefinition.label,
        extensions: [formatDefinition.extension],
      },
    ],
    properties: ["showOverwriteConfirmation"],
  };
  const parentWindow = BrowserWindow.fromWebContents(sender);
  const result = parentWindow
    ? await dialog.showSaveDialog(parentWindow, options)
    : await dialog.showSaveDialog(options);

  if (result.canceled || !result.filePath) {
    return { status: "canceled" };
  }

  const currentBranch = services.chatMessages.listChatMessages(chatId);
  if (format === "json") {
    const allMessages = services.chatMessages.listAllChatMessages(chatId);
    await writeFile(result.filePath, serializeChatAsJson(chat, currentBranch, allMessages), "utf8");
  } else if (format === "markdown") {
    await writeFile(result.filePath, serializeChatAsMarkdown(chat, currentBranch), "utf8");
  } else if (format === "pdf") {
    const pdf = await renderPdf(renderChatAsHtml(chat, currentBranch));
    await writeFile(result.filePath, pdf);
  } else {
    const unsupportedFormat: never = format;
    throw new Error(`Unsupported chat export format "${unsupportedFormat}".`);
  }

  return { status: "saved", filePath: result.filePath };
}

function safeFileName(title: string): string {
  return (
    title
      .replace(/[<>:"/\\|?*\p{Cc}]/gu, "-")
      .replace(/[. ]+$/g, "")
      .trim()
      .slice(0, 120) || "Chat"
  );
}

async function renderPdf(html: string): Promise<Buffer> {
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      javascript: false,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await printWindow.webContents.printToPDF({
      generateDocumentOutline: true,
      generateTaggedPDF: true,
      pageSize: "A4",
      preferCSSPageSize: true,
      printBackground: true,
    });
  } finally {
    printWindow.destroy();
  }
}
