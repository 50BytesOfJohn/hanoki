import * as React from "react";
import { Clock01Icon, DashboardSquare01Icon, PinIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getProviderIconById } from "@/lib/provider-icons";
import { cn } from "@/lib/utils";

import type { ModelPickerSection } from "./model-picker-data";

export interface ModelSectionRailItem {
  section: Pick<ModelPickerSection, "id" | "kind" | "label" | "provider">;
  /** Models in the section, or search matches while searching. */
  count: number;
}

const KIND_ICONS = {
  all: DashboardSquare01Icon,
  pinned: PinIcon,
  recent: Clock01Icon,
} as const;

/**
 * The vertical section list beside the picker and the library. Clicks keep
 * focus in the search field, so browsing never interrupts typing.
 */
export function ModelSectionRail({
  items,
  value,
  onValueChange,
  renderItemMenu,
  className,
}: {
  items: readonly ModelSectionRailItem[];
  value: string;
  onValueChange: (sectionId: string) => void;
  /** Context menu content for an item, if it has one. */
  renderItemMenu?: (item: ModelSectionRailItem) => React.ReactNode;
  className?: string;
}) {
  const firstProviderIndex = items.findIndex((item) => item.section.kind === "provider");

  return (
    <Tabs
      orientation="vertical"
      value={value}
      onValueChange={(next: string) => onValueChange(next)}
      className={cn("min-h-0 overflow-y-auto scrollbar", className)}
    >
      <TabsList aria-label="Sections" className="w-full gap-px bg-transparent p-1.5">
        {items.map((item, index) => {
          const menu = renderItemMenu?.(item);
          const trigger = (
            <TabsTrigger
              key={item.section.id}
              value={item.section.id}
              // Keep the caret in the search field.
              onMouseDown={(event) => event.preventDefault()}
              className={cn(
                "h-8 flex-none gap-2 px-2 text-[13px] font-normal dark:data-active:border-transparent dark:data-active:bg-hover",
                item.count === 0 && "opacity-50",
              )}
            >
              <SectionIcon section={item.section} />
              <span className="min-w-0 flex-1 truncate text-left">{item.section.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{item.count}</span>
            </TabsTrigger>
          );

          return (
            <React.Fragment key={item.section.id}>
              {index > 0 && index === firstProviderIndex ? (
                <Separator className="my-1 bg-separator" />
              ) : null}
              {menu ? (
                <ContextMenu>
                  <ContextMenuTrigger render={trigger} />
                  {menu}
                </ContextMenu>
              ) : (
                trigger
              )}
            </React.Fragment>
          );
        })}
      </TabsList>
    </Tabs>
  );
}

function SectionIcon({ section }: { section: ModelSectionRailItem["section"] }) {
  if (section.kind === "provider" && section.provider) {
    const ProviderIcon = getProviderIconById(section.provider.catalogId);
    return <ProviderIcon className="size-3.5" />;
  }

  if (section.kind === "provider") {
    return null;
  }

  return <HugeiconsIcon icon={KIND_ICONS[section.kind]} className="size-3.5" />;
}
