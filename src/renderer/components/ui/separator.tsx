"use client";

import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";

import { cn } from "@/lib/utils";

function Separator({ className, orientation = "horizontal", ...props }: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        // `self-stretch` silently degrades to flex-start once a caller sets an
        // explicit height (CSS: stretch only applies to an auto cross size), which
        // top-aligned every vertical rule in the app. Center instead, and keep a
        // min height so a caller that sets none still gets a visible rule.
        "shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:min-h-4 data-vertical:self-center",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
