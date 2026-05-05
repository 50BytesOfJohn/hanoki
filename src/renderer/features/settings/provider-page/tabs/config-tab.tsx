import type { ReactNode } from "react";
import { useState } from "react";
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
import { useDeleteProvider } from "@/mutations/providers";
import { listProvidersQueryOptions } from "@/queries/providers";

interface ProviderConfigModalProps {
  providerId: string;
  trigger: ReactNode;
}

export function ProviderConfigModal({ providerId, trigger }: ProviderConfigModalProps) {
  const navigate = useNavigate();
  const providersQuery = useQuery(listProvidersQueryOptions);
  const deleteProvider = useDeleteProvider();
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const provider = providersQuery.data?.find((item) => item.id === providerId);
  const catalogProvider = provider ? getSupportedProviderById(provider.catalogId) : null;

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
            <Modal.Body>
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
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextField fullWidth isReadOnly value={provider.displayName}>
                      <Label>Display Name</Label>
                      <Input fullWidth variant="secondary" />
                    </TextField>

                    <TextField
                      fullWidth
                      isReadOnly
                      value={catalogProvider?.name ?? provider.catalogId}
                    >
                      <Label>Provider</Label>
                      <Input fullWidth variant="secondary" />
                    </TextField>
                  </div>

                  <TextField fullWidth isReadOnly value={provider.id}>
                    <Label>Provider Record ID</Label>
                    <Input fullWidth variant="secondary" />
                  </TextField>

                  {catalogProvider ? (
                    <div className="space-y-4">
                      {Object.entries(catalogProvider.configFields).map(([key, field]) => (
                        <TextField
                          key={key}
                          fullWidth
                          isReadOnly
                          type={field.type === "secret" ? "password" : "text"}
                          value=""
                        >
                          <Label>{field.label}</Label>
                          <Input
                            fullWidth
                            id={`${provider.id}-${key}-summary`}
                            placeholder={
                              field.type === "secret" ? "Stored securely (hidden)" : "Configured"
                            }
                            variant="secondary"
                          />
                          <Description>
                            {field.description}
                            {field.type === "secret"
                              ? " Secret values are stored securely on this device and are hidden."
                              : null}
                          </Description>
                        </TextField>
                      ))}
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

                  <Alert>
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>Editing config here is not available yet</Alert.Title>
                      <Alert.Description>
                        Use the provider setup flow to create a new provider profile when you need
                        different credentials.
                      </Alert.Description>
                    </Alert.Content>
                  </Alert>

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
                </>
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
