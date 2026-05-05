import { createFileRoute } from "@tanstack/react-router";
import { ProviderSetupPage } from "@/features/settings/provider-setup-page";

export const Route = createFileRoute("/settings/providers/new/$providerId")({
  component: ProviderSetupRoutePage,
});

function ProviderSetupRoutePage() {
  const { providerId } = Route.useParams();
  return <ProviderSetupPage providerId={providerId} />;
}
