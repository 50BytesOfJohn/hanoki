import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/providers/new")({
  component: ProvidersNewLayoutRoute,
});

function ProvidersNewLayoutRoute() {
  return <Outlet />;
}
