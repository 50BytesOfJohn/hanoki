import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ProviderCredentialTestResult } from "@shared/ipc";
import {
  getSupportedProviderById,
  type ProviderConfigFieldDefinition,
  type SupportedProviderDefinition,
} from "@shared/providers/catalog";
import { Link, useNavigate } from "@tanstack/react-router";

import { providerApi } from "@/api/providers";
import { Button } from "@/components/ui/button";
import { getProviderIconById } from "@/lib/provider-icons";
import { queryKeys } from "@/queries/keys";
import { ProviderSetupConfigForm } from "./provider-setup-page/tabs";
import { SettingsPageHeader, SettingsPageShell } from "./settings-ui";

interface ProviderSetupPageProps {
  providerId: string;
}

export function ProviderSetupPage({ providerId }: ProviderSetupPageProps) {
  const provider = getSupportedProviderById(providerId);

  if (!provider) {
    return (
      <SettingsPageShell>
        <SettingsPageHeader
          title="Provider not supported"
          description="The selected provider is not available in this build yet."
        />
        <Button variant="outline" render={<Link to="/settings/providers/new" />}>
          <span>Back to providers</span>
        </Button>
      </SettingsPageShell>
    );
  }

  return <ProviderConfigSetup provider={provider} />;
}

interface ProviderConfigSetupProps {
  provider: SupportedProviderDefinition;
}

function ProviderConfigSetup({ provider }: ProviderConfigSetupProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ProviderIcon = getProviderIconById(provider.id);
  const [configValues, setConfigValues] = useState<Record<string, unknown>>(() =>
    createInitialConfigValues(provider),
  );
  const [isTestingCredentials, setIsTestingCredentials] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<ProviderCredentialTestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const hasRequiredFields = Object.entries(provider.configFields).every(([key, field]) => {
    return hasRequiredConfigValue(field, configValues[key]);
  });
  const canSubmitCredentialTest = provider.supportsCredentialTest && hasRequiredFields;

  function updateFieldValue(key: string, value: unknown): void {
    setConfigValues((current) => ({
      ...current,
      [key]: value,
    }));
    setTestError(null);
    setTestResult(null);
    setSaveError(null);
  }

  async function handleTestCredentials(): Promise<void> {
    if (!canSubmitCredentialTest) {
      return;
    }

    setIsTestingCredentials(true);
    setTestError(null);
    setTestResult(null);

    try {
      const result = await providerApi.testCredentials({
        providerId: provider.id,
        config: configValues,
      });

      setTestResult(result);
    } catch (error) {
      setTestError(getErrorMessage(error));
    } finally {
      setIsTestingCredentials(false);
    }
  }

  async function handleSave(): Promise<void> {
    if (!hasRequiredFields) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      await providerApi.saveProvider({
        catalogId: provider.id,
        config: configValues,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.providers.list() });

      void navigate({ to: "/settings" });
    } catch (error) {
      setSaveError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <SettingsPageShell>
      <SettingsPageHeader
        leading={
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-secondary">
            <ProviderIcon className="size-5" />
          </div>
        }
        title={provider.name}
        description={provider.description}
      />

      <ProviderSetupConfigForm
        provider={provider}
        configValues={configValues}
        hasRequiredFields={hasRequiredFields}
        canSubmitCredentialTest={canSubmitCredentialTest}
        isTestingCredentials={isTestingCredentials}
        isSaving={isSaving}
        testResult={testResult}
        testError={testError}
        saveError={saveError}
        onFieldChange={updateFieldValue}
        onTest={() => {
          void handleTestCredentials();
        }}
        onSave={() => {
          void handleSave();
        }}
      />
    </SettingsPageShell>
  );
}

function createInitialConfigValues(provider: SupportedProviderDefinition): Record<string, unknown> {
  const values: Record<string, unknown> = {};

  for (const [key, field] of Object.entries(provider.configFields)) {
    switch (field.type) {
      case "secret":
        values[key] = "";
        break;
      case "host+port":
        values[key] = {
          host: field.defaultHost ?? "127.0.0.1",
          port: String(field.defaultPort ?? 11434),
        };
        break;
    }
  }

  return values;
}

function hasRequiredConfigValue(field: ProviderConfigFieldDefinition, value: unknown): boolean {
  if (!field.required) {
    return true;
  }

  switch (field.type) {
    case "secret":
      return typeof value === "string" && value.trim().length > 0;
    case "host+port":
      return isValidHostPortValue(value);
  }
}

function isValidHostPortValue(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const host = (value as { host?: unknown }).host;
  if (typeof host !== "string" || !host.trim()) {
    return false;
  }

  const port = (value as { port?: unknown }).port;
  const parsedPort =
    typeof port === "number" ? port : typeof port === "string" && port.trim() ? Number(port) : NaN;

  return Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65_535;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return "Unknown error";
}
