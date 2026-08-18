import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { FileExportIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toastManager } from "@/components/ui/toast";
import { chatsApi } from "@/api/chats";
import { ChatEmptyPage } from "@/features/chat/chat-empty-page";
import {
  SettingsError,
  SettingsPageHeader,
  SettingsPageShell,
  SettingsRow,
  SettingsSection,
} from "@/features/settings/settings-ui";
import { useUpdateChatSettings } from "@/mutations/chats";
import { getChatQueryOptions } from "@/queries/chats";
import { useWorkspaceStore } from "@/features/workspace/store";
import { cn } from "@/lib/utils";
import {
  CHAT_EXPORT_FORMATS,
  DEFAULT_CHAT_EXPORT_FORMAT,
  isChatExportFormat,
} from "@shared/chat/chat-export";

export function ChatSettingsPage({ chatId }: { chatId?: string } = {}) {
  const currentChatId = useWorkspaceStore((state) => (chatId ? null : state.currentChatId));
  const activeChatId = chatId ?? currentChatId;

  const chatQuery = useQuery(getChatQueryOptions(activeChatId, { enabled: activeChatId !== null }));

  if (!activeChatId) {
    return (
      <ChatEmptyPage
        title="No chat selected"
        description="Open a chat to configure how it behaves."
      />
    );
  }

  if (chatQuery.isPending) {
    return (
      <ChatSettingsShell>
        <p className="text-[13px] text-muted-foreground">Loading chat settings…</p>
      </ChatSettingsShell>
    );
  }

  if (chatQuery.error) {
    return (
      <ChatEmptyPage
        title="Unable to load chat settings"
        description={
          chatQuery.error instanceof Error ? chatQuery.error.message : "Something went wrong."
        }
      />
    );
  }

  const chat = chatQuery.data;
  if (!chat) {
    return <ChatEmptyPage title="Chat not found" description="This chat may have been deleted." />;
  }

  return (
    <ChatSettingsShell>
      <SettingsPageHeader
        title="Chat Settings"
        description={
          <>
            Applies only to <span className="text-foreground">{chat.title}</span>, on top of your
            global defaults.
          </>
        }
      />

      <SettingsSection title="Model">
        <TemperatureRow
          key={chat.id}
          chatId={chat.id}
          savedTemperature={chat.data.settings.modelConfig?.temperature}
        />
      </SettingsSection>

      <SettingsSection title="Instructions">
        <SystemPromptRow
          key={`${chat.id}:${chat.data.settings.systemPrompt ?? ""}`}
          chatId={chat.id}
          savedPrompt={chat.data.settings.systemPrompt ?? ""}
        />
      </SettingsSection>

      <SettingsSection title="Export">
        <ChatExportRow chatId={chat.id} />
      </SettingsSection>
    </ChatSettingsShell>
  );
}

function ChatExportRow({ chatId }: { chatId: string }) {
  const [format, setFormat] = React.useState(DEFAULT_CHAT_EXPORT_FORMAT);
  const [isExporting, setIsExporting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleExport() {
    setError(null);
    setIsExporting(true);

    try {
      const result = await chatsApi.export(chatId, format);
      if (result.status === "saved") {
        toastManager.add({
          type: "success",
          title: "Chat exported",
          description: "The conversation was saved successfully.",
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export the chat.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <SettingsRow
      title="Save conversation"
      description="Markdown and PDF export the current branch. JSON preserves every branch and its metadata."
      htmlFor="chat-export-format"
    >
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <Select
            value={format}
            items={Object.fromEntries(CHAT_EXPORT_FORMATS.map((item) => [item.id, item.label]))}
            disabled={isExporting}
            onValueChange={(value) => {
              if (isChatExportFormat(value)) {
                setFormat(value);
              }
            }}
          >
            <SelectTrigger id="chat-export-format" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {CHAT_EXPORT_FORMATS.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            disabled={isExporting}
            onClick={() => void handleExport()}
          >
            {isExporting ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <HugeiconsIcon icon={FileExportIcon} data-icon="inline-start" />
            )}
            Export
          </Button>
        </div>
        <SettingsError>{error}</SettingsError>
      </div>
    </SettingsRow>
  );
}

function TemperatureRow({
  chatId,
  savedTemperature,
}: {
  chatId: string;
  savedTemperature?: number;
}) {
  const updateChatSettings = useUpdateChatSettings();
  const [temperature, setTemperature] = React.useState(savedTemperature ?? 0.7);
  const [error, setError] = React.useState<string | null>(null);
  const isCustom = savedTemperature !== undefined;

  React.useEffect(() => {
    if (savedTemperature !== undefined) {
      setTemperature(savedTemperature);
    }
  }, [savedTemperature]);

  function updateTemperature(nextTemperature: number | null) {
    setError(null);
    updateChatSettings.mutate(
      {
        id: chatId,
        input: { modelConfig: { temperature: nextTemperature } },
      },
      {
        onError: (err) => {
          setError(err instanceof Error ? err.message : "Failed to update the temperature.");
        },
      },
    );
  }

  return (
    <SettingsRow
      title="Temperature"
      description="Default uses the selected model's setting. Custom values run from focused (0) to varied (1); some models may ignore them."
      control={
        <div className="flex items-center gap-2.5">
          <span className="text-xs text-muted-foreground">{isCustom ? "Custom" : "Default"}</span>
          <Switch
            aria-label="Use custom temperature"
            checked={isCustom}
            disabled={updateChatSettings.isPending}
            onCheckedChange={(checked) => updateTemperature(checked ? temperature : null)}
          />
        </div>
      }
    >
      <div className="flex flex-col gap-2.5">
        {isCustom ? (
          <div className="flex items-center gap-3">
            <span id="chat-temperature-control-label" className="sr-only">
              Temperature
            </span>
            <Slider
              aria-labelledby="chat-temperature-control-label"
              className="max-w-sm"
              min={0}
              max={1}
              step={0.1}
              value={[temperature]}
              disabled={updateChatSettings.isPending}
              onValueChange={(value) =>
                setTemperature((typeof value === "number" ? value : value[0]) ?? temperature)
              }
              onValueCommitted={(value) => {
                const nextTemperature = typeof value === "number" ? value : value[0];
                if (nextTemperature !== undefined && nextTemperature !== savedTemperature) {
                  updateTemperature(nextTemperature);
                }
              }}
            />
            <output className="w-7 text-right font-mono text-xs tabular-nums">
              {temperature.toFixed(1)}
            </output>
          </div>
        ) : null}
        <SettingsError>{error}</SettingsError>
      </div>
    </SettingsRow>
  );
}

function ChatSettingsShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar">
      <SettingsPageShell>{children}</SettingsPageShell>
    </div>
  );
}

function SystemPromptRow({ chatId, savedPrompt }: { chatId: string; savedPrompt: string }) {
  const updateChatSettings = useUpdateChatSettings();
  const [prompt, setPrompt] = React.useState(savedPrompt);
  const [error, setError] = React.useState<string | null>(null);

  const isDirty = prompt !== savedPrompt;

  async function handleSave() {
    setError(null);
    try {
      await updateChatSettings.mutateAsync({
        id: chatId,
        input: { systemPrompt: prompt.trim().length === 0 ? null : prompt },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the system prompt.");
    }
  }

  return (
    <SettingsRow
      title="System prompt"
      htmlFor="chat-system-prompt"
      description="Sent with every message in this chat to steer the assistant. Leave empty to use the default behavior."
    >
      <div className="flex flex-col gap-2.5">
        <Textarea
          id="chat-system-prompt"
          placeholder="e.g. Answer concisely and prefer code examples."
          className="min-h-28"
          aria-invalid={error ? true : undefined}
          value={prompt}
          onChange={(event) => {
            setError(null);
            setPrompt(event.target.value);
          }}
        />
        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="sm"
            disabled={!isDirty || updateChatSettings.isPending}
            onClick={() => void handleSave()}
          >
            {updateChatSettings.isPending ? <Spinner data-icon="inline-start" /> : null}
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn("text-muted-foreground", !isDirty && "invisible")}
            disabled={updateChatSettings.isPending}
            onClick={() => {
              setPrompt(savedPrompt);
              setError(null);
            }}
          >
            Discard changes
          </Button>
        </div>
        <SettingsError>{error}</SettingsError>
      </div>
    </SettingsRow>
  );
}
