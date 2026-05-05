import { createFileRoute } from "@tanstack/react-router";
import { ProviderPickerPage } from "@/features/settings/provider-picker-page";

export const Route = createFileRoute("/settings/providers/new/")({
  component: ProviderPickerRoutePage,
});

function ProviderPickerRoutePage() {
  return <ProviderPickerPage />;
}
