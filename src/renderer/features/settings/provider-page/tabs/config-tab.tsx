import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Alert01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { getSupportedProviderById } from "@shared/providers/catalog";
import { useDeleteProvider, useUpdateProviderSecrets } from "@/mutations/providers";
import { listProvidersQueryOptions } from "@/queries/providers";

interface ProviderConfigModalProps {
  providerId: string;
  trigger: ReactElement;
}

export function ProviderConfigModal({ providerId, trigger }: ProviderConfigModalProps) {
  const navigate = useNavigate();
  const providersQuery = useQuery(listProvidersQueryOptions);
  const deleteProvider = useDeleteProvider();
  const updateProviderSecrets = useUpdateProviderSecrets();
  const resetProviderSecretsMutation = updateProviderSecrets.reset;
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [didUpdateSecrets, setDidUpdateSecrets] = useState(false);
  const provider = providersQuery.data?.find((item) => item.id === providerId);
  const catalogProvider = provider ? getSupportedProviderById(provider.catalogId) : null;
  const secretFields = catalogProvider
    ? Object.entries(catalogProvider.configFields).filter(([, field]) => field.type === "secret")
    : [];
  const canUpdateSecrets =
    Boolean(provider) &&
    secretFields.length > 0 &&
    secretFields.every(([key, field]) => !field.required || Boolean(secretValues[key]?.trim())) &&
    !updateProviderSecrets.isPending;

  useEffect(() => {
    if (!isConfigOpen) {
      return;
    }

    setSecretValues({});
    setDidUpdateSecrets(false);
    resetProviderSecretsMutation();
  }, [isConfigOpen, providerId, resetProviderSecretsMutation]);

  function handleSecretChange(key: string, value: string): void {
    setSecretValues((current) => ({
      ...current,
      [key]: value,
    }));
    setDidUpdateSecrets(false);
    updateProviderSecrets.reset();
  }

  function handleUpdateSecrets(): void {
    if (!provider || !catalogProvider || !canUpdateSecrets) {
      return;
    }

    const config: Record<string, unknown> = {};
    for (const [key] of secretFields) {
      config[key] = secretValues[key] ?? "";
    }

    updateProviderSecrets.mutate(
      {
        providerId: provider.id,
        config,
      },
      {
        onSuccess: () => {
          setSecretValues({});
          setDidUpdateSecrets(true);
        },
      },
    );
  }

  function handleDeleteConfirm(): void {
    if (!provider) {
      return;
    }

    deleteProvider.mutate(provider.id, {
      onSuccess: () => {
        setIsConfigOpen(false);
        void navigate({ to: "/settings" });
      },
    });
  }

  return (
    <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[85vh] overflow-y-auto scrollbar sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Provider Config</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-6">
          {providersQuery.isPending ? (
            <Alert>
              <Spinner />
              <AlertTitle>Loading provider config...</AlertTitle>
            </Alert>
          ) : providersQuery.isError ? (
            <Alert variant="destructive">
              <HugeiconsIcon icon={Alert01Icon} />
              <AlertTitle>Failed to load provider details</AlertTitle>
              <AlertDescription>{getErrorMessage(providersQuery.error)}</AlertDescription>
            </Alert>
          ) : !provider ? (
            <Alert variant="destructive">
              <HugeiconsIcon icon={Alert01Icon} />
              <AlertTitle>Provider not found.</AlertTitle>
            </Alert>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`${provider.id}-display-name`}>Display Name</FieldLabel>
                  <Input id={`${provider.id}-display-name`} readOnly value={provider.displayName} />
                </Field>

                <Field>
                  <FieldLabel htmlFor={`${provider.id}-provider`}>Provider</FieldLabel>
                  <Input
                    id={`${provider.id}-provider`}
                    readOnly
                    value={catalogProvider?.name ?? provider.catalogId}
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor={`${provider.id}-record-id`}>Provider Record ID</FieldLabel>
                <Input id={`${provider.id}-record-id`} readOnly value={provider.id} />
              </Field>

              {catalogProvider ? (
                <div className="flex flex-col gap-6">
                  {Object.entries(catalogProvider.configFields).map(([key, field]) =>
                    field.type === "secret" ? (
                      <Field key={key}>
                        <FieldLabel htmlFor={`${provider.id}-${key}-secret`}>
                          {field.label}
                        </FieldLabel>
                        <Input
                          id={`${provider.id}-${key}-secret`}
                          type="password"
                          placeholder={field.placeholder ?? "Enter replacement secret"}
                          value={secretValues[key] ?? ""}
                          onChange={(event) => {
                            handleSecretChange(key, event.target.value);
                          }}
                        />
                        <FieldDescription>
                          {field.description}
                          {" Enter a new value only when you want to overwrite the stored secret."}
                        </FieldDescription>
                      </Field>
                    ) : (
                      <Field key={key}>
                        <FieldLabel htmlFor={`${provider.id}-${key}-summary`}>
                          {field.label}
                        </FieldLabel>
                        <Input
                          id={`${provider.id}-${key}-summary`}
                          readOnly
                          value=""
                          placeholder="Configured"
                        />
                        <FieldDescription>{field.description}</FieldDescription>
                      </Field>
                    ),
                  )}

                  {updateProviderSecrets.isError ? (
                    <Alert variant="destructive">
                      <HugeiconsIcon icon={Alert01Icon} />
                      <AlertTitle>Failed to update secrets</AlertTitle>
                      <AlertDescription>
                        {getErrorMessage(updateProviderSecrets.error)}
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  {didUpdateSecrets ? (
                    <Alert>
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} className="text-success" />
                      <AlertTitle>Provider secrets updated</AlertTitle>
                      <AlertDescription>
                        The provider will refresh its model list in the background.
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  {secretFields.length > 0 ? (
                    <div className="flex justify-end">
                      <Button
                        variant="secondary"
                        disabled={!canUpdateSecrets}
                        onClick={handleUpdateSecrets}
                      >
                        {updateProviderSecrets.isPending ? (
                          <Spinner data-icon="inline-start" />
                        ) : null}
                        Update Secrets
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <Alert>
                  <HugeiconsIcon icon={Alert01Icon} />
                  <AlertTitle>Unsupported provider definition</AlertTitle>
                  <AlertDescription>
                    This provider record exists, but the provider catalog entry is not available in
                    this build.
                  </AlertDescription>
                </Alert>
              )}

              {deleteProvider.isError ? (
                <Alert variant="destructive">
                  <HugeiconsIcon icon={Alert01Icon} />
                  <AlertTitle>Failed to delete provider</AlertTitle>
                  <AlertDescription>{getErrorMessage(deleteProvider.error)}</AlertDescription>
                </Alert>
              ) : null}

              <Alert>
                <HugeiconsIcon icon={Alert01Icon} />
                <AlertTitle>Delete provider</AlertTitle>
                <AlertDescription>
                  Deleting this provider permanently removes the provider profile and all connected
                  models.
                </AlertDescription>
                <AlertDialog>
                  <div className="col-span-full mt-2 flex justify-end">
                    <AlertDialogTrigger
                      render={
                        <Button
                          variant="destructive"
                          disabled={deleteProvider.isPending}
                          onClick={() => deleteProvider.reset()}
                        />
                      }
                    >
                      Delete Provider
                    </AlertDialogTrigger>
                  </div>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Provider</AlertDialogTitle>
                      <AlertDialogDescription>
                        {provider
                          ? `Delete "${provider.displayName}" and all models connected to it? This action cannot be undone.`
                          : "Delete this provider and all models connected to it? This action cannot be undone."}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        disabled={!provider || deleteProvider.isPending}
                        onClick={handleDeleteConfirm}
                      >
                        {deleteProvider.isPending ? <Spinner data-icon="inline-start" /> : null}
                        Delete Provider
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </Alert>
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" className="text-muted-foreground" />}>
            Done
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Unknown error";
}
