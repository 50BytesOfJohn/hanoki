import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateWorkspace } from "@/mutations/workspaces";
import { parseWorkspaceName } from "@shared/workspace/workspace-name";
import {
  SettingsError,
  SettingsPageHeader,
  SettingsPageShell,
  SettingsRow,
  SettingsSection,
} from "./settings-ui";

export function CreateWorkspacePage() {
  const navigate = useNavigate();
  const createWorkspace = useCreateWorkspace();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const parsed = parseWorkspaceName(name);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    setError(null);
    try {
      const created = await createWorkspace.mutateAsync(parsed.value);
      await navigate({
        to: "/settings/$workspaceId",
        params: { workspaceId: created.id },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workspace.");
    }
  }

  return (
    <SettingsPageShell>
      <SettingsPageHeader
        title="New workspace"
        description="Workspaces keep chats, assets, and settings separate."
      />

      <form noValidate className="space-y-8" onSubmit={(event) => void handleSubmit(event)}>
        <SettingsSection title="Details">
          <SettingsRow
            title="Name"
            htmlFor="new-workspace-name"
            description="1–64 characters. You can change it any time."
            control={
              <Input
                id="new-workspace-name"
                className="w-52"
                autoComplete="off"
                placeholder="Workspace name"
                aria-invalid={error ? true : undefined}
                value={name}
                disabled={createWorkspace.isPending}
                onChange={(event) => {
                  setName(event.target.value);
                  setError(null);
                }}
              />
            }
          >
            {error ? <SettingsError>{error}</SettingsError> : null}
          </SettingsRow>
        </SettingsSection>

        <Button type="submit" disabled={createWorkspace.isPending || !name.trim()}>
          {createWorkspace.isPending ? "Creating…" : "Create workspace"}
        </Button>
      </form>
    </SettingsPageShell>
  );
}
