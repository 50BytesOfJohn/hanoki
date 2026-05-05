import { createFileRoute } from "@tanstack/react-router";
import { ProviderPage } from "@/features/settings/provider-page";

export const Route = createFileRoute("/settings/providers/$providerId")({
  component: ProviderRoutePage,
});

function ProviderRoutePage() {
  const { providerId } = Route.useParams();

  return <ProviderPage providerId={providerId} />;
}
