import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Alert,
  AlertDialog,
  Button,
  Description,
  Input,
  Label,
  Modal,
  TextField,
} from "@heroui/react";
import { getSupportedProviderById } from "@shared/providers/catalog";
import { useDeleteProvider, useUpdateProviderSecrets } from "@/mutations/providers";
import { listProvidersQueryOptions } from "@/queries/providers";

interface ProviderConfigModalProps {
  providerId: string;
  trigger: ReactNode;
}

export function ProviderConfigModal({ providerId, trigger }: ProviderConfigModalProps) {
  const navigate = useNavigate();
  const providersQuery = useQuery(listProvidersQueryOptions);
  const deleteProvider = useDeleteProvider();
  const updateProviderSecrets = useUpdateProviderSecrets();
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
    updateProviderSecrets.reset();
  }, [isConfigOpen, providerId]);

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
    <Modal isOpen={isConfigOpen} onOpenChange={setIsConfigOpen}>
      {trigger}
      <Modal.Backdrop variant="blur">
        <Modal.Container size="lg">
          <Modal.Dialog className="sm:max-w-3xl">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Provider Config</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="gap-6">
              {providersQuery.isPending ? (
                <Alert>
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Loading provider config...</Alert.Title>
                  </Alert.Content>
                </Alert>
              ) : providersQuery.isError ? (
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Failed to load provider details</Alert.Title>
                    <Alert.Description>{getErrorMessage(providersQuery.error)}</Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : !provider ? (
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Provider not found.</Alert.Title>
                  </Alert.Content>
                </Alert>
              ) : (
                <div className="space-y-6">
                  <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                    <TextField fullWidth isReadOnly className="gap-2" value={provider.displayName}>
                      <Label>Display Name</Label>
                      <Input fullWidth variant="secondary" />
                    </TextField>

                    <TextField
                      fullWidth
                      isReadOnly
                      className="gap-2"
                      value={catalogProvider?.name ?? provider.catalogId}
                    >
                      <Label>Provider</Label>
                      <Input fullWidth variant="secondary" />
                    </TextField>
                  </div>

                  <TextField fullWidth isReadOnly className="gap-2" value={provider.id}>
                    <Label>Provider Record ID</Label>
                    <Input fullWidth variant="secondary" />
                  </TextField>

                  {catalogProvider ? (
                    <div className="space-y-6">
                      {Object.entries(catalogProvider.configFields).map(([key, field]) =>
                        field.type === "secret" ? (
                          <TextField
                            key={key}
                            fullWidth
                            className="gap-2"
                            type="password"
                            value={secretValues[key] ?? ""}
                            onChange={(value) => {
                              handleSecretChange(key, value);
                            }}
                          >
                            <Label>{field.label}</Label>
                            <Input
                              fullWidth
                              id={`${provider.id}-${key}-secret`}
                              placeholder={field.placeholder ?? "Enter replacement secret"}
                              variant="secondary"
                            />
                            <Description>
                              {field.description}
                              {
                                " Enter a new value only when you want to overwrite the stored secret."
                              }
                            </Description>
                          </TextField>
                        ) : (
                          <TextField key={key} fullWidth isReadOnly className="gap-2" value="">
                            <Label>{field.label}</Label>
                            <Input
                              fullWidth
                              id={`${provider.id}-${key}-summary`}
                              placeholder="Configured"
                              variant="secondary"
                            />
                            <Description>{field.description}</Description>
                          </TextField>
                        ),
                      )}

                      {updateProviderSecrets.isError ? (
                        <Alert status="danger">
                          <Alert.Indicator />
                          <Alert.Content>
                            <Alert.Title>Failed to update secrets</Alert.Title>
                            <Alert.Description>
                              {getErrorMessage(updateProviderSecrets.error)}
                            </Alert.Description>
                          </Alert.Content>
                        </Alert>
                      ) : null}

                      {didUpdateSecrets ? (
                        <Alert status="success">
                          <Alert.Indicator />
                          <Alert.Content>
                            <Alert.Title>Provider secrets updated</Alert.Title>
                            <Alert.Description>
                              The provider will refresh its model list in the background.
                            </Alert.Description>
                          </Alert.Content>
                        </Alert>
                      ) : null}

                      {secretFields.length > 0 ? (
                        <div className="flex justify-end">
                          <Button
                            variant="secondary"
                            isDisabled={!canUpdateSecrets}
                            isPending={updateProviderSecrets.isPending}
                            onPress={handleUpdateSecrets}
                          >
                            Update Secrets
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <Alert>
                      <Alert.Indicator />
                      <Alert.Content>
                        <Alert.Title>Unsupported provider definition</Alert.Title>
                        <Alert.Description>
                          This provider record exists, but the provider catalog entry is not
                          available in this build.
                        </Alert.Description>
                      </Alert.Content>
                    </Alert>
                  )}

                  {deleteProvider.isError ? (
                    <Alert status="danger">
                      <Alert.Indicator />
                      <Alert.Content>
                        <Alert.Title>Failed to delete provider</Alert.Title>
                        <Alert.Description>
                          {getErrorMessage(deleteProvider.error)}
                        </Alert.Description>
                      </Alert.Content>
                    </Alert>
                  ) : null}

                  <Alert>
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>Delete provider</Alert.Title>
                      <Alert.Description>
                        Deleting this provider permanently removes the provider profile and all
                        connected models.
                      </Alert.Description>
                    </Alert.Content>
                    <AlertDialog>
                      <Button
                        variant="danger"
                        isDisabled={deleteProvider.isPending}
                        onPress={() => deleteProvider.reset()}
                      >
                        Delete Provider
                      </Button>
                      <AlertDialog.Backdrop>
                        <AlertDialog.Container>
                          <AlertDialog.Dialog>
                            <AlertDialog.CloseTrigger />
                            <AlertDialog.Header>
                              <AlertDialog.Icon status="danger" />
                              <AlertDialog.Heading>Delete Provider</AlertDialog.Heading>
                            </AlertDialog.Header>
                            <AlertDialog.Body>
                              {provider
                                ? `Delete "${provider.displayName}" and all models connected to it? This action cannot be undone.`
                                : "Delete this provider and all models connected to it? This action cannot be undone."}
                            </AlertDialog.Body>
                            <AlertDialog.Footer>
                              <Button slot="close" variant="tertiary">
                                Cancel
                              </Button>
                              <Button
                                variant="danger"
                                isDisabled={!provider || deleteProvider.isPending}
                                isPending={deleteProvider.isPending}
                                onPress={handleDeleteConfirm}
                              >
                                Delete Provider
                              </Button>
                            </AlertDialog.Footer>
                          </AlertDialog.Dialog>
                        </AlertDialog.Container>
                      </AlertDialog.Backdrop>
                    </AlertDialog>
                  </Alert>
                </div>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close" variant="tertiary">
                Done
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Unknown error";
}
