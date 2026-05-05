import type { ProviderCredentialTestResult } from "@shared/ipc";
import type { SupportedProviderDefinition } from "@shared/providers/catalog";
import { Link } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface ProviderSetupConfigTabProps {
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

export function ProviderSetupConfigTab({
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
}: ProviderSetupConfigTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Config</CardTitle>
        <CardDescription>Configure the required fields for {provider.name}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(provider.configFields).map(([key, field]) => {
          switch (field.type) {
            case "secret":
              return (
                <Field key={key} className="max-w-xl">
                  <FieldLabel htmlFor={`${provider.id}-${key}`}>{field.label}</FieldLabel>
                  <Input
                    id={`${provider.id}-${key}`}
                    type="password"
                    autoComplete="off"
                    placeholder={field.placeholder}
                    value={typeof configValues[key] === "string" ? configValues[key] : ""}
                    onChange={(event) => {
                      onFieldChange(key, event.target.value);
                    }}
                  />
                  <FieldDescription>
                    {field.description}
                    {" Your value is encrypted and stored securely on this device."}
                  </FieldDescription>
                </Field>
              );
            case "host+port": {
              const hostPortValue = getHostPortInputValue(
                configValues[key],
                field.defaultHost,
                field.defaultPort,
              );

              return (
                <Field key={key} className="max-w-xl">
                  <FieldLabel>{field.label}</FieldLabel>
                  <div className="grid gap-3 sm:grid-cols-2">
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
                  <FieldDescription>{field.description}</FieldDescription>
                </Field>
              );
            }
          }
        })}

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

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" render={<Link to="/settings/providers/new" />}>
            <span>Back</span>
          </Button>
          <Button
            variant="secondary"
            disabled={!canSubmitCredentialTest || isTestingCredentials || isSaving}
            onClick={onTest}
          >
            <span>{isTestingCredentials ? "Testing..." : "Test"}</span>
          </Button>
          <Button disabled={!hasRequiredFields || isSaving} onClick={onSave}>
            <span>{isSaving ? "Saving..." : "Save"}</span>
          </Button>
        </div>
      </CardContent>
    </Card>
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
