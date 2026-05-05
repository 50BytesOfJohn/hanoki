import { createFileRoute } from "@tanstack/react-router";
import { PinnedBranchesPage } from "@/features/chat/modules/pinned-branches/pinned-branches-page";

export const Route = createFileRoute("/chat/pinned-branches")({
  component: PinnedBranchesPage,
});
