import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import {
  Button,
  Card,
  ColorSwatchPicker,
  Description,
  FieldError,
  Form,
  Input,
  Label,
  Switch,
  TextField,
} from "@heroui/react";

import { useUpdateGlobalChatSettings } from "@/mutations/settings";
import { useUpdateWorkspace } from "@/mutations/workspaces";
import { globalChatSettingsQueryOptions } from "@/queries/settings";
import { findWorkspaceById, listWorkspacesQueryOptions } from "@/queries/workspaces";
import type { GlobalChatSettingsUpdateInput } from "@shared/ipc";
import { parseWorkspaceName, workspaceNameSchema } from "@shared/workspace/workspace-name";

const WORKSPACE_COLORS: { hex: string; label: string }[] = [
  { hex: "#b85c5c", label: "Red" },
  { hex: "#c07840", label: "Orange" },
  { hex: "#a89040", label: "Amber" },
  { hex: "#5c9c5c", label: "Green" },
  { hex: "#40938c", label: "Teal" },
  { hex: "#4d7ab5", label: "Blue" },
  { hex: "#6b62b5", label: "Indigo" },
  { hex: "#9055a8", label: "Purple" },
  { hex: "#b55580", label: "Pink" },
  { hex: "#7a7a7a", label: "Gray" },
];

interface SettingsPageProps {
  workspaceId?: string;
}

export function SettingsPage({ workspaceId }: SettingsPageProps) {
  const { data: workspaces } = useQuery(listWorkspacesQueryOptions);
  const workspace = findWorkspaceById(workspaces, workspaceId);

  if (workspaceId && !workspace) {
    return (
      <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto w-full max-w-2xl text-sm opacity-50">
          Loading workspace settings...
        </div>
      </main>
    );
  }

  return (
    <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        {!workspaceId ? <GlobalChatSettingsCard /> : null}
        {workspace ? (
          <>
            <WorkspacePageHeader workspaceName={workspace.name} color={workspace.color} />
            <WorkspaceNameForm
              key={`${workspace.id}:${workspace.name}`}
              workspaceId={workspace.id}
              workspaceName={workspace.name}
            />
            <WorkspaceColorPicker
              key={`${workspace.id}:color`}
              workspaceId={workspace.id}
              currentColor={workspace.color}
            />
          </>
        ) : null}
      </div>
    </main>
  );
}

interface WorkspacePageHeaderProps {
  workspaceName: string;
  color?: string;
}

function WorkspacePageHeader({ workspaceName, color }: WorkspacePageHeaderProps) {
  const accentColor = color ?? "#7a7a7a";
  const glowColor = toRgba(accentColor, 0.22);

  return (
    <div className="relative pb-2 pt-4">
      <div
        className="pointer-events-none absolute left-0 top-0 h-16 w-40"
        style={{
          background: `radial-gradient(ellipse 100% 100% at 0% 0%, ${glowColor}, transparent)`,
        }}
      />
      <div
        className="relative mb-3 h-px w-10 rounded-full"
        style={{ background: accentColor, opacity: 0.7 }}
      />
      <h1 className="relative font-heading text-xl font-semibold tracking-tight">
        {workspaceName}
      </h1>
    </div>
  );
}

function GlobalChatSettingsCard() {
  const { data: globalChatSettings, isPending: isLoadingGlobalChatSettings } = useQuery(
    globalChatSettingsQueryOptions,
  );
  const updateGlobalChatSettings = useUpdateGlobalChatSettings();
  const [updateError, setUpdateError] = useState<string | null>(null);

  const isPending = isLoadingGlobalChatSettings || updateGlobalChatSettings.isPending;
  const promptStickyPosition = globalChatSettings?.promptStickyPosition ?? true;
  const submitOnModEnter = globalChatSettings?.formSubmitBehavior === "mod-enter";

  function updateSettings(input: GlobalChatSettingsUpdateInput) {
    setUpdateError(null);
    updateGlobalChatSettings.mutate(input, {
      onError: (error) => {
        setUpdateError(
          error instanceof Error ? error.message : "Failed to update global chat settings.",
        );
      },
    });
  }

  return (
    <Card variant="secondary">
      <Card.Header>
        <Card.Title>Chat</Card.Title>
        <Card.Description>Global behavior for the chat composer.</Card.Description>
      </Card.Header>
      <Card.Content>
        <Switch
          isSelected={promptStickyPosition}
          isDisabled={isPending}
          onChange={(checked) => {
            updateSettings({ promptStickyPosition: checked });
          }}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Switch.Content>
            <Label>Prompt Sticky Position</Label>
            <Description>
              Keep the prompt composer pinned to the bottom while scrolling.
            </Description>
          </Switch.Content>
        </Switch>

        <Switch
          isSelected={submitOnModEnter}
          isDisabled={isPending}
          onChange={(checked) => {
            updateSettings({
              formSubmitBehavior: checked ? "mod-enter" : "enter",
            });
          }}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Switch.Content>
            <Label>Submit with Cmd/Ctrl + Enter</Label>
            <Description>
              When off, Enter submits. Shift+Enter always inserts a newline.
            </Description>
          </Switch.Content>
        </Switch>
      </Card.Content>

      {updateError ? (
        <Card.Footer>
          <FieldError>{updateError}</FieldError>
        </Card.Footer>
      ) : null}
    </Card>
  );
}

interface WorkspaceNameFormProps {
  workspaceId: string;
  workspaceName: string;
}

function WorkspaceNameForm({ workspaceId, workspaceName }: WorkspaceNameFormProps) {
  const updateWorkspace = useUpdateWorkspace();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const formId = `workspace-name-${workspaceId}`;

  const form = useForm({
    defaultValues: {
      name: workspaceName,
    },
    onSubmit: async ({ value, formApi }) => {
      setSubmitError(null);

      const parsedName = parseWorkspaceName(value.name);
      if (!parsedName.ok) {
        return;
      }

      try {
        const updatedWorkspace = await updateWorkspace.mutateAsync({
          id: workspaceId,
          name: parsedName.value,
        });
        formApi.reset({ name: updatedWorkspace.name });
      } catch (error) {
        setSubmitError(error instanceof Error ? error.message : "Failed to update workspace name.");
      }
    },
  });

  return (
    <Card variant="secondary">
      <Card.Header>
        <Card.Title>Workspace Name</Card.Title>
        <Card.Description>Update how this workspace appears in settings and chat.</Card.Description>
      </Card.Header>
      <Card.Content>
        <Form
          id={formId}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <form.Field
            name="name"
            validators={{
              onChange: workspaceNameSchema,
              onBlur: ({ value }) => {
                const parsed = parseWorkspaceName(value);
                return parsed.ok ? undefined : parsed.error;
              },
              onSubmit: ({ value }) => {
                const parsed = parseWorkspaceName(value);
                return parsed.ok ? undefined : parsed.error;
              },
            }}
          >
            {(field) => {
              const errorMessage = getFirstErrorMessage(field.state.meta.errors);
              return (
                <TextField
                  fullWidth
                  id={field.name}
                  name={field.name}
                  isInvalid={!!errorMessage}
                  validationBehavior="aria"
                >
                  <Label>Name</Label>
                  <Input
                    fullWidth
                    id={field.name}
                    autoComplete="off"
                    variant="secondary"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      setSubmitError(null);
                      field.handleChange(event.target.value);
                    }}
                  />
                  <Description>Must be between 1 and 64 characters after trimming.</Description>
                  {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
                </TextField>
              );
            }}
          </form.Field>
        </Form>
      </Card.Content>
      <Card.Footer>
        <form.Subscribe
          selector={(state) => ({
            canSubmit: state.canSubmit,
            isDirty: state.isDirty,
            isSubmitting: state.isSubmitting,
          })}
        >
          {({ canSubmit, isDirty, isSubmitting }) => (
            <Button
              type="submit"
              form={formId}
              isDisabled={!canSubmit || !isDirty || isSubmitting}
              isPending={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Save Name"}
            </Button>
          )}
        </form.Subscribe>
        {submitError ? <FieldError>{submitError}</FieldError> : null}
      </Card.Footer>
    </Card>
  );
}

interface WorkspaceColorPickerProps {
  workspaceId: string;
  currentColor?: string;
}

function WorkspaceColorPicker({ workspaceId, currentColor }: WorkspaceColorPickerProps) {
  const updateWorkspace = useUpdateWorkspace();
  const [selectedColor, setSelectedColor] = useState<string | undefined>(currentColor);
  const [error, setError] = useState<string | null>(null);

  async function handleColorChange(hex: string | null) {
    setError(null);
    setSelectedColor(hex ?? undefined);

    try {
      const updated = await updateWorkspace.mutateAsync({
        id: workspaceId,
        color: hex,
      });
      setSelectedColor(updated.color);
    } catch (err) {
      setSelectedColor(currentColor);
      setError(err instanceof Error ? err.message : "Failed to update workspace color.");
    }
  }

  return (
    <Card variant="secondary">
      <Card.Header>
        <Card.Title>Workspace Color</Card.Title>
        <Card.Description>
          Choose a color to identify this workspace in the sidebar.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <ColorSwatchPicker
          aria-label="Workspace color"
          value={selectedColor}
          size="lg"
          layout="grid"
          isDisabled={updateWorkspace.isPending}
          onChange={(color) => {
            void handleColorChange(color.toString("hex"));
          }}
        >
          {WORKSPACE_COLORS.map((color) => (
            <ColorSwatchPicker.Item key={color.hex} aria-label={color.label} color={color.hex}>
              <ColorSwatchPicker.Swatch />
              <ColorSwatchPicker.Indicator />
            </ColorSwatchPicker.Item>
          ))}
        </ColorSwatchPicker>
      </Card.Content>

      {error ? (
        <Card.Footer>
          <FieldError>{error}</FieldError>
        </Card.Footer>
      ) : null}
    </Card>
  );
}

function getFirstErrorMessage(errors: readonly unknown[]): string | null {
  for (const error of errors) {
    const message = getErrorMessage(error);
    if (message) {
      return message;
    }
  }

  return null;
}

function toRgba(hex: string, alpha: number): string {
  const normalized = normalizeHexColor(hex);
  const match = /^#(?<red>[a-f\d]{2})(?<green>[a-f\d]{2})(?<blue>[a-f\d]{2})$/i.exec(normalized);

  if (!match?.groups) {
    return `rgba(122, 122, 122, ${alpha})`;
  }

  const red = Number.parseInt(match.groups.red, 16);
  const green = Number.parseInt(match.groups.green, 16);
  const blue = Number.parseInt(match.groups.blue, 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function normalizeHexColor(hex: string): string {
  const value = hex.trim();

  if (/^#[a-f\d]{6}$/i.test(value)) {
    return value;
  }

  if (/^#[a-f\d]{3}$/i.test(value)) {
    const red = value[1];
    const green = value[2];
    const blue = value[3];
    return `#${red}${red}${green}${green}${blue}${blue}`;
  }

  return "#7a7a7a";
}

function getErrorMessage(error: unknown): string | null {
  if (!error) {
    return null;
  }

  if (typeof error === "string") {
    return error;
  }

  if (Array.isArray(error)) {
    for (const nestedError of error) {
      const nestedMessage = getErrorMessage(nestedError);
      if (nestedMessage) {
        return nestedMessage;
      }
    }

    return null;
  }

  if (typeof error === "object" && "message" in error) {
    const message = (error as { message: unknown }).message;
    return typeof message === "string" ? message : null;
  }

  return null;
}
