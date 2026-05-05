"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";

import { cn } from "@/lib/utils";

function Tree({ className, render, ...props }: useRender.ComponentProps<"div">) {
  const defaultProps = {
    className: cn("flex flex-col [--tree-indent:12px]", className),
    "data-slot": "tree",
    role: "tree" as const,
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
}

function TreeItem({
  className,
  level = 0,
  render,
  ...props
}: useRender.ComponentProps<"div"> & {
  level?: number;
}) {
  const defaultProps = {
    className: cn(
      "group/tree-item relative flex h-8 items-center gap-1.5 rounded-md px-2 text-sm outline-hidden select-none transition-colors duration-150",
      "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
      "data-[focused=true]:ring-2 data-[focused=true]:ring-ring",
      "data-[drop-target=true]:bg-muted/50 data-[drop-target=true]:ring-1 data-[drop-target=true]:ring-muted-foreground/30 data-[drop-target=true]:ring-dashed",
      "hover:bg-accent/50",
      className,
    ),
    "data-slot": "tree-item",
    role: "treeitem" as const,
    style: {
      "--tree-level": level,
      paddingInlineStart: `calc(var(--tree-indent) * ${level} + 0.5rem)`,
    } as React.CSSProperties,
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
}

function TreeItemIcon({ className, render, ...props }: useRender.ComponentProps<"span">) {
  const defaultProps = {
    className: cn(
      "flex shrink-0 items-center justify-center [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
      className,
    ),
    "data-slot": "tree-item-icon",
  };

  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(defaultProps, props),
    render,
  });
}

function TreeItemLabel({ className, render, ...props }: useRender.ComponentProps<"span">) {
  const defaultProps = {
    className: cn("flex-1 truncate text-sm", className),
    "data-slot": "tree-item-label",
  };

  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(defaultProps, props),
    render,
  });
}

function TreeItemActions({ className, render, ...props }: useRender.ComponentProps<"div">) {
  const defaultProps = {
    className: cn(
      "ml-auto flex items-center gap-0.5",
      "group-focus-within/tree-item:opacity-100 group-hover/tree-item:opacity-100 data-[state=open]:opacity-100 md:opacity-0",
      className,
    ),
    "data-slot": "tree-item-actions",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
}

function TreeItemAction({ className, render, ...props }: useRender.ComponentProps<"button">) {
  const defaultProps = {
    className: cn(
      "inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-transparent text-muted-foreground outline-hidden transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:shrink-0",
      className,
    ),
    "data-slot": "tree-item-action",
    type: "button" as const,
  };

  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(defaultProps, props),
    render,
  });
}

function TreeItemRenameInput({ className, render, ...props }: useRender.ComponentProps<"input">) {
  const defaultProps = {
    className: cn(
      "h-6 w-full min-w-0 rounded border border-ring bg-background px-1.5 text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
      className,
    ),
    "data-slot": "tree-item-rename-input",
  };

  return useRender({
    defaultTagName: "input",
    props: mergeProps<"input">(defaultProps, props),
    render,
  });
}

function TreeDragLine({ className, render, ...props }: useRender.ComponentProps<"div">) {
  const defaultProps = {
    className: cn("pointer-events-none absolute left-0 right-0 h-0.5 bg-primary", className),
    "data-slot": "tree-drag-line",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
}

export {
  Tree,
  TreeDragLine,
  TreeItem,
  TreeItemAction,
  TreeItemActions,
  TreeItemIcon,
  TreeItemLabel,
  TreeItemRenameInput,
};
