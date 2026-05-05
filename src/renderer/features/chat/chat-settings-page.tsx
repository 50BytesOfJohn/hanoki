import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { ChatEmptyPage } from "@/features/chat/chat-empty-page";
import { useUpdateChatSettings } from "@/mutations/chats";
import { getChatQueryOptions } from "@/queries/chats";
import { useWorkspaceStore } from "@/features/workspace/store";

export function ChatSettingsPage() {
  const activeTab = useWorkspaceStore((state) => state.activeTab());
  const activeChatId = activeTab?.type === "chat" ? activeTab.chatId : null;

  const chatQuery = useQuery(getChatQueryOptions(activeChatId, { enabled: activeChatId !== null }));
  const updateChatSettings = useUpdateChatSettings();
  const [systemPrompt, setSystemPrompt] = React.useState("");
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setSystemPrompt(chatQuery.data?.settings.systemPrompt ?? "");
    setSubmitError(null);
  }, [chatQuery.data?.id, chatQuery.data?.settings.systemPrompt]);

  if (!activeChatId) {
    return (
      <ChatEmptyPage
        title="Chat Settings"
        description="Open a chat tab to edit its system prompt."
      />
    );
  }

  if (chatQuery.isPending) {
    return <ChatEmptyPage title="Chat Settings" description="Loading chat settings..." />;
  }

  if (chatQuery.error) {
    return (
      <ChatEmptyPage
        title="Chat Settings"
        description={
          chatQuery.error instanceof Error
            ? chatQuery.error.message
            : "Failed to load chat settings."
        }
      />
    );
  }

  const chat = chatQuery.data;
  if (!chat) {
    return <ChatEmptyPage title="Chat Settings" description="Chat not found." />;
  }

  const savedSystemPrompt = chat.settings.systemPrompt ?? "";
  const isDirty = systemPrompt !== savedSystemPrompt;

  async function handleSave() {
    setSubmitError(null);
    const nextSystemPrompt = systemPrompt.trim().length === 0 ? null : systemPrompt;

    try {
      await updateChatSettings.mutateAsync({
        id: chat.id,
        input: {
          systemPrompt: nextSystemPrompt,
        },
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to update chat settings.");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-6">
      <div className="space-y-1">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Chat Settings</h1>
        <p className="text-muted-foreground">
          Configure how <span className="text-foreground">{chat.title}</span> behaves.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>System Prompt</CardTitle>
          <CardDescription>
            Sent with every request in this chat to guide the assistant.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel htmlFor="system-prompt">Prompt</FieldLabel>
            <Textarea
              id="system-prompt"
              placeholder="Add instructions for this chat"
              value={systemPrompt}
              onChange={(event) => {
                setSubmitError(null);
                setSystemPrompt(event.target.value);
              }}
            />
            <FieldDescription>
              Leave empty to use the default behavior for this chat.
            </FieldDescription>
          </Field>

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              className="w-fit"
              disabled={!isDirty || updateChatSettings.isPending}
              onClick={() => {
                void handleSave();
              }}
            >
              {updateChatSettings.isPending ? "Saving..." : "Save Prompt"}
            </Button>
            {submitError ? (
              <p className="text-destructive-foreground text-xs">{submitError}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
