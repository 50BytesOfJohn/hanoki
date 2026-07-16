import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
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

export function ChatSettingsPage() {
  const activeChatId = useWorkspaceStore((state) => state.currentChatId);

  const chatQuery = useQuery(
    getChatQueryOptions(activeChatId, { enabled: activeChatId !== null }),
  );

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
        <p className="text-[13px] text-muted-foreground">
          Loading chat settings…
        </p>
      </ChatSettingsShell>
    );
  }

  if (chatQuery.error) {
    return (
      <ChatEmptyPage
        title="Unable to load chat settings"
        description={
          chatQuery.error instanceof Error
            ? chatQuery.error.message
            : "Something went wrong."
        }
      />
    );
  }

  const chat = chatQuery.data;
  if (!chat) {
    return (
      <ChatEmptyPage
        title="Chat not found"
        description="This chat may have been deleted."
      />
    );
  }

  return (
    <ChatSettingsShell>
      <SettingsPageHeader
        title="Chat Settings"
        description={
          <>
            Applies only to{" "}
            <span className="text-foreground">{chat.title}</span>, on top of
            your global defaults.
          </>
        }
      />

      <SettingsSection title="Instructions">
        <SystemPromptRow
          key={`${chat.id}:${chat.settings.systemPrompt ?? ""}`}
          chatId={chat.id}
          savedPrompt={chat.settings.systemPrompt ?? ""}
        />
      </SettingsSection>
    </ChatSettingsShell>
  );
}

function ChatSettingsShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar">
      <SettingsPageShell>{children}</SettingsPageShell>
    </div>
  );
}

function SystemPromptRow({
  chatId,
  savedPrompt,
}: {
  chatId: string;
  savedPrompt: string;
}) {
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
      setError(
        err instanceof Error
          ? err.message
          : "Failed to save the system prompt.",
      );
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
            {updateChatSettings.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : null}
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
