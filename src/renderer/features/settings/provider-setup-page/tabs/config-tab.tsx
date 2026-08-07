import type { ProviderCredentialTestResult } from "@shared/ipc";
import type { SupportedProviderDefinition } from "@shared/providers/catalog";
import { Link } from "@tanstack/react-router";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsRow, SettingsSection } from "../../settings-ui";

interface ProviderSetupConfigFormProps {
  provider: SupportedProviderDefinition;
  configValues: Record<string, unknown>;
  hasRequiredFields: boolean;
  canSubmitCredentialTest: boolean;
  isTestingCredentials: boolean;
  isSaving: boolean;
  testResult: ProviderCredentialTestResult | null;
  testError: string | null;
  saveError: string | null;
  onFieldChange: (key: string, value: unknown) => void;
  onTest: () => void;
  onSave: () => void;
}

export function ProviderSetupConfigForm({
  provider,
  configValues,
  hasRequiredFields,
  canSubmitCredentialTest,
  isTestingCredentials,
  isSaving,
  testResult,
  testError,
  saveError,
  onFieldChange,
  onTest,
  onSave,
}: ProviderSetupConfigFormProps) {
  const hasConfigFields = Object.keys(provider.configFields).length > 0;

  return (
    <div className="space-y-8">
      <SettingsSection
        title="Configuration"
        description={
          hasConfigFields
            ? "Credentials are encrypted and stored securely on this device."
            : "This provider needs no configuration — it uses credentials already on this device."
        }
      >
        {Object.entries(provider.configFields).map(([key, field]) => {
          switch (field.type) {
            case "secret":
              return (
                <SettingsRow
                  key={key}
                  title={field.label}
                  htmlFor={`${provider.id}-${key}`}
                  description={field.description}
                >
                  <Input
                    id={`${provider.id}-${key}`}
                    type="password"
                    autoComplete="off"
                    className="max-w-md"
                    placeholder={field.placeholder}
                    value={typeof configValues[key] === "string" ? configValues[key] : ""}
                    onChange={(event) => {
                      onFieldChange(key, event.target.value);
                    }}
                  />
                </SettingsRow>
              );
            case "host+port": {
              const hostPortValue = getHostPortInputValue(
                configValues[key],
                field.defaultHost,
                field.defaultPort,
              );

              return (
                <SettingsRow
                  key={key}
                  title={field.label}
                  htmlFor={`${provider.id}-${key}-host`}
                  description={field.description}
                >
                  <div className="grid max-w-md gap-3 sm:grid-cols-[1fr_8rem]">
                    <Input
                      id={`${provider.id}-${key}-host`}
                      type="text"
                      autoComplete="off"
                      placeholder={field.defaultHost ?? "127.0.0.1"}
                      value={hostPortValue.host}
                      onChange={(event) => {
                        onFieldChange(key, {
                          ...hostPortValue,
                          host: event.target.value,
                        });
                      }}
                    />
                    <Input
                      id={`${provider.id}-${key}-port`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={65535}
                      autoComplete="off"
                      placeholder={String(field.defaultPort ?? 11434)}
                      value={hostPortValue.port}
                      onChange={(event) => {
                        onFieldChange(key, {
                          ...hostPortValue,
                          port: event.target.value,
                        });
                      }}
                    />
                  </div>
                </SettingsRow>
              );
            }
          }
        })}
      </SettingsSection>

      {!provider.supportsCredentialTest ? (
        <Alert variant="default">
          <AlertTitle>Credential test unavailable</AlertTitle>
          <AlertDescription>
            This provider does not expose a supported validation endpoint yet.
          </AlertDescription>
        </Alert>
      ) : null}

      {testError ? (
        <Alert variant="destructive">
          <AlertTitle>Test request failed</AlertTitle>
          <AlertDescription>{testError}</AlertDescription>
        </Alert>
      ) : null}

      {testResult ? (
        <Alert variant={testResult.ok ? "default" : "destructive"}>
          <AlertTitle>{testResult.ok ? "Credentials valid" : "Credentials rejected"}</AlertTitle>
          <AlertDescription>{testResult.message}</AlertDescription>
        </Alert>
      ) : null}

      {saveError ? (
        <Alert variant="destructive">
          <AlertTitle>Failed to save provider</AlertTitle>
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" render={<Link to="/settings/providers/new" />}>
          <span>Back</span>
        </Button>
        <div className="flex items-center gap-2">
          {provider.supportsCredentialTest ? (
            <Button
              variant="outline"
              disabled={!canSubmitCredentialTest || isTestingCredentials || isSaving}
              onClick={onTest}
            >
              <span>{isTestingCredentials ? "Testing…" : "Test connection"}</span>
            </Button>
          ) : null}
          <Button disabled={!hasRequiredFields || isSaving} onClick={onSave}>
            <span>{isSaving ? "Saving…" : "Save provider"}</span>
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        After saving, {provider.name} models sync in the background and appear on the provider page.
      </p>
    </div>
  );
}

function getHostPortInputValue(
  value: unknown,
  defaultHost?: string,
  defaultPort?: number,
): { host: string; port: string } {
  const fallback = {
    host: defaultHost ?? "",
    port: defaultPort ? String(defaultPort) : "",
  };

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }

  const hostRaw = (value as { host?: unknown }).host;
  const host = typeof hostRaw === "string" ? hostRaw : fallback.host;
  const rawPort = (value as { port?: unknown }).port;
  const port =
    typeof rawPort === "number"
      ? String(rawPort)
      : typeof rawPort === "string"
        ? rawPort
        : fallback.port;

  return { host, port };
}
