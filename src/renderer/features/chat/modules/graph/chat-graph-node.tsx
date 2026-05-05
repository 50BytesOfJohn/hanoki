import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ChatGraphNode } from "./chat-graph-layout";

export function ChatGraphNodeView({ data }: NodeProps<ChatGraphNode>) {
  return (
    <>
      <Handle className="pointer-events-none opacity-0" position={Position.Top} type="target" />

      <Card
        className={cn(
          "grid h-full w-[22rem] grid-rows-[auto_1fr_auto] border-border bg-card shadow-none transition-colors",
          data.isActivePath && "border-foreground/30 bg-secondary",
          data.isSelected && "ring-2 ring-ring ring-offset-2 ring-offset-background",
        )}
      >
        <CardHeader className="gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <Badge variant={getRoleBadgeVariant(data.role)}>{data.role}</Badge>
            {data.hasMultipleChildren ? (
              <Badge variant="outline">{data.childCount} branches</Badge>
            ) : null}
          </div>

          <CardTitle className="text-sm leading-5">
            {data.role === "assistant" ? "Assistant message" : "User message"}
          </CardTitle>
        </CardHeader>

        <CardContent className="px-5 py-5">
          <p className="line-clamp-6 text-base leading-8 text-muted-foreground">{data.preview}</p>
        </CardContent>

        <CardFooter className="justify-between border-t border-border px-5 py-4 text-xs text-muted-foreground">
          <span>{data.childCount === 0 ? "Leaf node" : `${data.childCount} children`}</span>
          <span>{data.isActivePath ? "Active branch" : "Available branch"}</span>
        </CardFooter>
      </Card>

      <Handle className="pointer-events-none opacity-0" position={Position.Bottom} type="source" />
    </>
  );
}

function getRoleBadgeVariant(role: ChatGraphNode["data"]["role"]): "secondary" | "outline" {
  if (role === "assistant") {
    return "secondary";
  }

  if (role === "user") {
    return "secondary";
  }

  return "outline";
}
