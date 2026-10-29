import { ApiIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "../utils";
import type { ProviderIconProps } from "./remote-provider-icon";

export function OpenAiCompatibleIcon({ className }: ProviderIconProps) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex size-4 shrink-0 items-center justify-center", className)}
    >
      <HugeiconsIcon icon={ApiIcon} className="size-full" />
    </span>
  );
}
