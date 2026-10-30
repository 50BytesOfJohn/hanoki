import {
  getToolOrDynamicToolName,
  isToolUIPart,
  type DynamicToolUIPart,
  type ToolUIPart,
} from "ai";

type ToolPart = ToolUIPart | DynamicToolUIPart;

export type TraceEntry =
  | { kind: "reasoning"; key: string; text: string; running: boolean }
  | { kind: "tools"; key: string; toolName: string; parts: ToolPart[] };

interface TracePartInput {
  type: string;
  text?: string;
  state?: string;
}

/**
 * Collapses one list of steps so repeated work takes one row: calls to the same
 * tool merge at the first call's position, and reasoning merges into one row.
 * A call waiting on the user's answer always stands alone so it can't be missed.
 */
export function groupTraceParts(
  parts: readonly TracePartInput[],
  isAnimating: boolean,
): TraceEntry[] {
  const entries: TraceEntry[] = [];
  const tools = new Map<string, Extract<TraceEntry, { kind: "tools" }>>();
  let reasoning: Extract<TraceEntry, { kind: "reasoning" }> | null = null;

  parts.forEach((part, index) => {
    if (part.type === "reasoning") {
      const text = part.text ?? "";
      const running = isAnimating && part.state === "streaming";
      if (reasoning) {
        reasoning.text = [reasoning.text, text].filter(Boolean).join("\n\n");
        reasoning.running ||= running;
      } else {
        reasoning = { kind: "reasoning", key: `reasoning-${index}`, text, running };
        entries.push(reasoning);
      }
      return;
    }

    if (!isToolUIPart(part as never)) return;
    const toolPart = part as ToolPart;
    const toolName = getToolOrDynamicToolName(toolPart);

    if (toolPart.state === "approval-requested" && !toolPart.approval.isAutomatic) {
      entries.push({ kind: "tools", key: toolPart.toolCallId, toolName, parts: [toolPart] });
      return;
    }

    const existing = tools.get(toolName);
    if (existing) {
      existing.parts.push(toolPart);
      return;
    }
    const entry: Extract<TraceEntry, { kind: "tools" }> = {
      kind: "tools",
      key: toolPart.toolCallId,
      toolName,
      parts: [toolPart],
    };
    tools.set(toolName, entry);
    entries.push(entry);
  });

  return entries;
}
