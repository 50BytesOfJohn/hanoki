import { useState } from "react";
import { BotIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "../utils";

export interface ProviderIconProps {
  className?: string;
}

interface RemoteProviderIconOptions {
  lightUrl: string;
  darkUrl?: string;
  alt: string;
}

export function createRemoteProviderIcon({ lightUrl, darkUrl, alt }: RemoteProviderIconOptions) {
  return function RemoteProviderIcon({ className }: ProviderIconProps) {
    const [hasError, setHasError] = useState(false);

    if (hasError) {
      return <FallbackProviderIcon className={className} />;
    }

    return (
      <span
        aria-hidden="true"
        className={cn("inline-flex size-4 shrink-0 items-center justify-center", className)}
      >
        {darkUrl ? (
          <>
            <img
              src={lightUrl}
              alt={alt}
              className="block h-full w-full object-contain dark:hidden"
              onError={() => {
                setHasError(true);
              }}
            />
            <img
              src={darkUrl}
              alt={alt}
              className="hidden h-full w-full object-contain dark:block"
              onError={() => {
                setHasError(true);
              }}
            />
          </>
        ) : (
          <img
            src={lightUrl}
            alt={alt}
            className="h-full w-full object-contain"
            onError={() => {
              setHasError(true);
            }}
          />
        )}
      </span>
    );
  };
}

export function FallbackProviderIcon({ className }: ProviderIconProps) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex size-4 shrink-0 items-center justify-center", className)}
    >
      <HugeiconsIcon icon={BotIcon} className="size-full" />
    </span>
  );
}
