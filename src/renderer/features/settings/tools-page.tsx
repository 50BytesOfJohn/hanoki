import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert02Icon,
  ComputerTerminal01Icon,
  FolderOpenIcon,
  McpServerIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { TerminalToolMode } from "@shared/ipc";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { useUpdateTerminalToolSettings } from "@/mutations/settings";
import { settingsApi } from "@/api/settings";
import { toolSettingsQueryOptions } from "@/queries/settings";
import {
  SettingsError,
  SettingsPageHeader,
  SettingsPageShell,
  SettingsRow,
  SettingsSection,
} from "./settings-ui";

/*
 * Wording note: this page is read by people who have never opened a terminal.
 * Every mode says what happens on *their computer*, not what happens to the
 * tool, and the risky mode says plainly what it gives up.
 */
const TERMINAL_MODES: ReadonlyArray<{
  value: TerminalToolMode;
  label: string;
  description: string;
}> = [
  {
    value: "disabled",
    label: "Off",
    description:
      "The assistant cannot run commands or open your files. Nothing on your computer can change.",
  },
  {
    value: "ask",
    label: "Ask me every time",
    description:
      "You see the exact command before it runs and choose whether to allow it. Nothing runs until you say yes.",
  },
  {
    value: "always",
    label: "Run without asking",
    description:
      "Commands run straight away, with no prompt. Convenient, and the least safe option.",
  },
];

export function ToolsPage() {
  const { data: toolSettings, isPending } = useQuery(toolSettingsQueryOptions);
  const updateTerminal = useUpdateTerminalToolSettings();
  const [error, setError] = React.useState<string | null>(null);
  const terminal = toolSettings?.terminal;
  const mode = terminal?.mode ?? "disabled";
  const isBusy = isPending || updateTerminal.isPending;

  function update(input: Parameters<typeof updateTerminal.mutate>[0]) {
    setError(null);
    updateTerminal.mutate(input, {
      onError: (mutationError) => {
        setError(
          mutationError instanceof Error
            ? mutationError.message
            : "Failed to update terminal settings.",
        );
      },
    });
  }

  async function chooseWorkingDirectory() {
    const picked = await settingsApi.pickTerminalWorkingDirectory();
    if (picked) {
      update({ workingDirectory: picked });
    }
  }

  return (
    <SettingsPageShell>
      <SettingsPageHeader
        title="Tools & MCP"
        description="Extra abilities you can give the assistant beyond writing replies."
      />

      <SettingsSection
        title="Terminal & files"
        description="Lets the assistant run commands and work with files on this computer — the same things you could do yourself in a terminal window."
      >
        <SettingsRow
          icon={<HugeiconsIcon icon={ComputerTerminal01Icon} className="size-4" />}
          title="When the assistant wants to run something"
          description={
            mode === "disabled"
              ? "Turn this on to let the assistant use your terminal."
              : `Runs in ${terminal?.shell ?? "your login shell"}, with your normal settings and installed programs.`
          }
        >
          <RadioGroup
            value={mode}
            onValueChange={(next) => update({ mode: next as TerminalToolMode })}
            aria-label="Terminal access"
          >
            {TERMINAL_MODES.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors",
                  mode === option.value
                    ? "border-primary/60 bg-surface-secondary"
                    : "hover:bg-hover",
                  isBusy && "pointer-events-none opacity-60",
                )}
              >
                <RadioGroupItem value={option.value} className="mt-0.5" disabled={isBusy} />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-foreground">
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {option.description}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </SettingsRow>

        {mode !== "disabled" ? (
          <SettingsRow
            icon={<HugeiconsIcon icon={FolderOpenIcon} className="size-4" />}
            title="Starting folder"
            description="Where commands begin. This is a starting point, not a limit — the assistant can still reach files elsewhere on your computer."
            control={
              <Button variant="secondary" disabled={isBusy} onClick={chooseWorkingDirectory}>
                Change
              </Button>
            }
          >
            <p className="truncate rounded-md bg-surface-secondary px-2.5 py-1.5 font-mono text-xs text-muted-foreground">
              {terminal?.workingDirectory ?? "…"}
            </p>
          </SettingsRow>
        ) : null}
      </SettingsSection>

      {mode === "always" ? (
        <Alert variant="destructive">
          <HugeiconsIcon icon={Alert02Icon} />
          <AlertTitle>Commands run without your approval</AlertTitle>
          <AlertDescription>
            The assistant can change or delete files, install software, and send data over the
            network without asking first. This also applies to instructions it picks up from content
            it reads, such as a web page or a file, not only to what you type.
          </AlertDescription>
        </Alert>
      ) : null}

      <SettingsError>{error}</SettingsError>

      <SettingsSection title="MCP servers">
        <SettingsRow
          icon={<HugeiconsIcon icon={McpServerIcon} className="size-4" />}
          title="Connect an MCP server"
          description="Support for Model Context Protocol servers is not available yet."
        />
      </SettingsSection>

      <p className="px-0.5 text-xs text-muted-foreground">
        Even when turned on here, the assistant only gets these tools in chats where you switch them
        on — from the tools menu next to the message box, or by typing @Terminal.
      </p>
    </SettingsPageShell>
  );
}
