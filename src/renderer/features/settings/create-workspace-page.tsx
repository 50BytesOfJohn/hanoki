import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useCreateWorkspace } from "@/mutations/workspaces";
import { parseWorkspaceName, workspaceNameSchema } from "@shared/workspace/workspace-name";

export function CreateWorkspacePage() {
  const navigate = useNavigate();
  const createWorkspace = useCreateWorkspace();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      name: "",
    },
    onSubmit: async ({ value, formApi }) => {
      setSubmitError(null);

      const parsedName = parseWorkspaceName(value.name);
      if (!parsedName.ok) {
        return;
      }

      try {
        const createdWorkspace = await createWorkspace.mutateAsync(parsedName.value);
        formApi.reset({ name: "" });
        await navigate({
          to: "/settings/$workspaceId",
          params: { workspaceId: createdWorkspace.id },
        });
      } catch (error) {
        setSubmitError(error instanceof Error ? error.message : "Failed to create workspace.");
      }
    },
  });

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-6 py-6">
      <div className="space-y-2">
        <h1 className="font-heading text-xl font-semibold tracking-tight">Create Workspace</h1>
        <p className="text-sm text-muted-foreground">
          Create a new workspace with its own assets folder and settings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workspace Details</CardTitle>
          <CardDescription>Choose a name for the new workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form
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
                  <Field className="max-w-md">
                    <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                    <Input
                      id={field.name}
                      autoComplete="off"
                      aria-invalid={errorMessage ? true : undefined}
                      placeholder="Workspace name"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => {
                        setSubmitError(null);
                        field.handleChange(event.target.value);
                      }}
                    />
                    <FieldDescription>
                      Must be between 1 and 64 characters after trimming.
                    </FieldDescription>
                    {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
                  </Field>
                );
              }}
            </form.Field>

            <div className="flex flex-col gap-2">
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
                    className="w-fit"
                    disabled={!canSubmit || !isDirty || isSubmitting}
                  >
                    {isSubmitting ? "Creating..." : "Create Workspace"}
                  </Button>
                )}
              </form.Subscribe>
              {submitError ? (
                <p className="text-destructive-foreground text-xs">{submitError}</p>
              ) : null}
            </div>
          </Form>
        </CardContent>
      </Card>
    </div>
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
