import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { WorkspaceOrb } from "@/components/ui/workspace-orb";
import { useUpdateGlobalChatSettings } from "@/mutations/settings";
import { useUpdateWorkspace } from "@/mutations/workspaces";
import { globalChatSettingsQueryOptions } from "@/queries/settings";
import { findWorkspaceById, listWorkspacesQueryOptions } from "@/queries/workspaces";
import type { GlobalChatSettingsUpdateInput, WorkspaceInfo } from "@shared/ipc";
import {
  CHAT_TREE_FOLDER_PLACEMENTS,
  CHAT_TREE_SORT_ORDERS,
  isChatTreeFolderPlacement,
  isChatTreeSortOrder,
} from "@shared/chat/chat-tree-sort";
import { useChatTreeSort } from "@/features/chat/use-chat-tree-sort";
import { parseWorkspaceName } from "@shared/workspace/workspace-name";
import { WORKSPACE_ORB_COLORS } from "@shared/workspace/workspace-orb-colors";
import {
  SettingsError,
  SettingsPageHeader,
  SettingsPageShell,
  SettingsRow,
  SettingsSection,
} from "./settings-ui";

interface SettingsPageProps {
  workspaceId?: string;
}

export function SettingsPage({ workspaceId }: SettingsPageProps) {
  const { data: workspaces } = useQuery(listWorkspacesQueryOptions);
  const workspace = findWorkspaceById(workspaces, workspaceId);

  if (workspaceId && !workspace) {
    return (
      <SettingsPageShell>
        <p className="text-[13px] text-muted-foreground">Loading workspace settings…</p>
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell>
      {workspace ? <WorkspaceSettings workspace={workspace} /> : <GeneralSettings />}
    </SettingsPageShell>
  );
}

/* ── General ── */

const SUBMIT_BEHAVIORS = [
  { id: "enter", label: "Enter" },
  { id: "mod-enter", label: "Cmd/Ctrl + Enter" },
] as const;

const SIDEBAR_VIEW_MODES = [
  { id: "tree", label: "Folder tree" },
  { id: "activity", label: "Recent activity" },
] as const;

const TABS_POSITIONS = [
  { id: "top", label: "Top of window" },
  { id: "sidebar", label: "Sidebar" },
] as const;

function GeneralSettings() {
  const { data: globalChatSettings, isPending: isLoadingSettings } = useQuery(
    globalChatSettingsQueryOptions,
  );
  const updateGlobalChatSettings = useUpdateGlobalChatSettings();
  const [updateError, setUpdateError] = useState<string | null>(null);

  const isPending = isLoadingSettings || updateGlobalChatSettings.isPending;
  const promptStickyPosition = globalChatSettings?.promptStickyPosition ?? true;
  const submitBehavior = globalChatSettings?.formSubmitBehavior ?? "enter";
  const sidebarViewMode = globalChatSettings?.sidebarViewMode ?? "tree";
  const tabsPosition = globalChatSettings?.tabsPosition ?? "top";
  const activityPanelEnabled = globalChatSettings?.activityPanelEnabled ?? true;

  function updateSettings(input: GlobalChatSettingsUpdateInput) {
    setUpdateError(null);
    updateGlobalChatSettings.mutate(input, {
      onError: (error) => {
        setUpdateError(error instanceof Error ? error.message : "Failed to update settings.");
      },
    });
  }

  return (
    <>
      <SettingsPageHeader
        title="General"
        description="Preferences that apply across every workspace."
      />

      <SettingsSection title="Composer">
        <SettingsRow
          title="Pin composer while scrolling"
          description="Keep the prompt docked to the bottom of the conversation."
          control={
            <Switch
              aria-label="Pin composer while scrolling"
              checked={promptStickyPosition}
              disabled={isPending}
              onCheckedChange={(checked) => updateSettings({ promptStickyPosition: checked })}
            />
          }
        />
        <SettingsRow
          title="Send message with"
          description="Shift+Enter always inserts a newline."
          control={
            <Select
              value={submitBehavior}
              items={Object.fromEntries(SUBMIT_BEHAVIORS.map((b) => [b.id, b.label]))}
              disabled={isPending}
              onValueChange={(value) => {
                if (value === "enter" || value === "mod-enter") {
                  updateSettings({ formSubmitBehavior: value });
                }
              }}
            >
              <SelectTrigger aria-label="Send message with" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {SUBMIT_BEHAVIORS.map((behavior) => (
                    <SelectItem key={behavior.id} value={behavior.id}>
                      {behavior.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          }
        />
      </SettingsSection>

      <SettingsSection title="Sidebar">
        <SettingsRow
          title="Default chat list view"
          description="Workspaces can override this from the sidebar options menu."
          control={
            <Select
              value={sidebarViewMode}
              items={Object.fromEntries(SIDEBAR_VIEW_MODES.map((m) => [m.id, m.label]))}
              disabled={isPending}
              onValueChange={(value) => {
                if (value === "tree" || value === "activity") {
                  updateSettings({ sidebarViewMode: value });
                }
              }}
            >
              <SelectTrigger aria-label="Default chat list view" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {SIDEBAR_VIEW_MODES.map((mode) => (
                    <SelectItem key={mode.id} value={mode.id}>
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          }
        />
      </SettingsSection>

      <SettingsSection title="Tabs">
        <SettingsRow
          title="Tab bar position"
          description="Show open chat tabs at the top of the window or in the sidebar."
          control={
            <Select
              value={tabsPosition}
              items={Object.fromEntries(TABS_POSITIONS.map((p) => [p.id, p.label]))}
              disabled={isPending}
              onValueChange={(value) => {
                if (value === "top" || value === "sidebar") {
                  updateSettings({ tabsPosition: value });
                }
              }}
            >
              <SelectTrigger aria-label="Tab bar position" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {TABS_POSITIONS.map((position) => (
                    <SelectItem key={position.id} value={position.id}>
                      {position.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          }
        />
      </SettingsSection>

      <SettingsSection title="Activity">
        <SettingsRow
          title="Show the activity panel"
          description="Counters in the title bar for chats that are working and replies you have not read yet."
          control={
            <Switch
              aria-label="Show the activity panel"
              checked={activityPanelEnabled}
              disabled={isPending}
              onCheckedChange={(checked) => updateSettings({ activityPanelEnabled: checked })}
            />
          }
        />
      </SettingsSection>

      <SettingsError>{updateError}</SettingsError>
    </>
  );
}

/* ── Workspace ── */

function WorkspaceSettings({ workspace }: { workspace: WorkspaceInfo }) {
  return (
    <>
      <SettingsPageHeader
        leading={<WorkspaceOrb color={workspace.color} size="lg" />}
        title={workspace.name}
        description="Workspace identity. Chats and assets in this workspace stay separate."
      />

      <SettingsSection title="Identity">
        <WorkspaceNameRow
          key={`${workspace.id}:${workspace.name}`}
          workspaceId={workspace.id}
          workspaceName={workspace.name}
        />
        <WorkspaceOrbRow
          key={`${workspace.id}:color`}
          workspaceId={workspace.id}
          currentColor={workspace.color}
        />
      </SettingsSection>

      <SettingsSection title="Chat list">
        <WorkspaceChatTreeSortRows workspaceId={workspace.id} />
      </SettingsSection>
    </>
  );
}

function WorkspaceChatTreeSortRows({ workspaceId }: { workspaceId: string }) {
  const { sortOrder, folderPlacement, isPending, setSortOrder, setFolderPlacement } =
    useChatTreeSort(workspaceId);

  return (
    <>
      <SettingsRow
        title="Sort chats by"
        description="Applies to the folder tree. Recent activity is always sorted by latest message."
        control={
          <Select
            value={sortOrder}
            items={Object.fromEntries(CHAT_TREE_SORT_ORDERS.map((o) => [o.id, o.label]))}
            disabled={isPending}
            onValueChange={(value) => {
              if (isChatTreeSortOrder(value)) {
                setSortOrder(value);
              }
            }}
          >
            <SelectTrigger aria-label="Sort chats by" className="w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {CHAT_TREE_SORT_ORDERS.map((order) => (
                  <SelectItem key={order.id} value={order.id}>
                    {order.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        }
      />
      <SettingsRow
        title="Folder placement"
        description="Where folders sit relative to chats in the folder tree."
        control={
          <Select
            value={folderPlacement}
            items={Object.fromEntries(CHAT_TREE_FOLDER_PLACEMENTS.map((p) => [p.id, p.label]))}
            disabled={isPending}
            onValueChange={(value) => {
              if (isChatTreeFolderPlacement(value)) {
                setFolderPlacement(value);
              }
            }}
          >
            <SelectTrigger aria-label="Folder placement" className="w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {CHAT_TREE_FOLDER_PLACEMENTS.map((placement) => (
                  <SelectItem key={placement.id} value={placement.id}>
                    {placement.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        }
      />
    </>
  );
}

function WorkspaceNameRow({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const updateWorkspace = useUpdateWorkspace();
  const [value, setValue] = useState(workspaceName);
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    const parsed = parseWorkspaceName(value);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }

    setError(null);
    if (parsed.value === workspaceName) {
      setValue(parsed.value);
      return;
    }

    try {
      const updated = await updateWorkspace.mutateAsync({ id: workspaceId, name: parsed.value });
      setValue(updated.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update workspace name.");
    }
  }

  return (
    <SettingsRow
      title="Name"
      htmlFor="workspace-name"
      description="Shown in the sidebar and the workspace switcher. Saves on blur."
      control={
        <Input
          id="workspace-name"
          className="w-52"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          value={value}
          disabled={updateWorkspace.isPending}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              setValue(workspaceName);
              setError(null);
            }
          }}
        />
      }
    >
      {error ? <SettingsError>{error}</SettingsError> : null}
    </SettingsRow>
  );
}

function WorkspaceOrbRow({
  workspaceId,
  currentColor,
}: {
  workspaceId: string;
  currentColor?: string;
}) {
  const updateWorkspace = useUpdateWorkspace();
  const [selectedColor, setSelectedColor] = useState<string | undefined>(currentColor);
  const [error, setError] = useState<string | null>(null);

  async function handleColorChange(hex: string) {
    setError(null);
    setSelectedColor(hex);

    try {
      const updated = await updateWorkspace.mutateAsync({ id: workspaceId, color: hex });
      setSelectedColor(updated.color);
    } catch (err) {
      setSelectedColor(currentColor);
      setError(err instanceof Error ? err.message : "Failed to update workspace orb.");
    }
  }

  return (
    <SettingsRow title="Orb" description="Identifies this workspace across the app.">
      <div role="radiogroup" aria-label="Workspace orb" className="flex flex-wrap gap-3">
        {WORKSPACE_ORB_COLORS.map((color) => {
          const isSelected = selectedColor?.toLowerCase() === color.hex.toLowerCase();
          return (
            <button
              key={color.hex}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={color.label}
              title={color.label}
              disabled={updateWorkspace.isPending}
              onClick={() => {
                void handleColorChange(color.hex);
              }}
              className={cn(
                "rounded-full p-0.5 outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                isSelected ? "scale-105 ring-2 ring-primary" : "hover:scale-105",
              )}
            >
              <WorkspaceOrb color={color.hex} size="md" static />
            </button>
          );
        })}
      </div>
      {error ? (
        <div className="mt-3">
          <SettingsError>{error}</SettingsError>
        </div>
      ) : null}
    </SettingsRow>
  );
}
