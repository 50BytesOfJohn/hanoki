import { mkdtemp, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ToolLoopAgent, isStepCount, type ModelMessage, type ToolApprovalResponse } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";

import { createTerminalTools, TERMINAL_TOOL_NAMES } from "./terminal-tools";

/*
 * Guards the safety boundary: with `toolApproval` set, a terminal tool call
 * must not touch the disk until an approval response comes back.
 */

const isWindows = process.platform === "win32";

// `doGenerate` accepts either a function or a list of canned results; we only
// use the function form.
type MockGenerate = Extract<
  NonNullable<NonNullable<ConstructorParameters<typeof MockLanguageModelV3>[0]>["doGenerate"]>,
  (...args: never[]) => unknown
>;

/**
 * Replies with one tool call on the first step, then plain text.
 * ponytail: the result literals are cast once rather than spelled out against
 * the provider's usage/finish-reason types — the agent validates them at run
 * time, and this test is about approvals, not about the mock's typing.
 */
function createToolCallingModel(toolName: string, input: unknown) {
  let callCount = 0;
  const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

  const doGenerate = (async () => {
    callCount += 1;
    return callCount === 1
      ? {
          finishReason: "tool-calls",
          usage,
          content: [
            { type: "tool-call", toolCallId: "call-1", toolName, input: JSON.stringify(input) },
          ],
          warnings: [],
        }
      : {
          finishReason: "stop",
          usage,
          content: [{ type: "text", text: "done" }],
          warnings: [],
        };
  }) as unknown as MockGenerate;

  return new MockLanguageModelV3({ doGenerate });
}

function createAgent(options: {
  chatId: string;
  configuredCwd: string;
  toolName: string;
  input: unknown;
  withApproval: boolean;
}) {
  return new ToolLoopAgent({
    model: createToolCallingModel(options.toolName, options.input),
    tools: createTerminalTools({
      chatId: options.chatId,
      configuredCwd: options.configuredCwd,
    }),
    ...(options.withApproval
      ? {
          toolApproval: Object.fromEntries(
            TERMINAL_TOOL_NAMES.map((name) => [name, "user-approval" as const]),
          ),
        }
      : {}),
    stopWhen: isStepCount(5),
  });
}

describe.skipIf(isWindows)("terminal tool approvals", () => {
  async function makeTempDir() {
    return realpath(await mkdtemp(path.join(tmpdir(), "hanoki-approval-")));
  }

  it("does not write the file until the approval is granted", async () => {
    const cwd = await makeTempDir();
    const target = path.join(cwd, "note.txt");
    const agent = createAgent({
      chatId: `chat-${crypto.randomUUID()}`,
      configuredCwd: cwd,
      toolName: "terminalWriteFile",
      input: { path: target, content: "written" },
      withApproval: true,
    });

    const messages: ModelMessage[] = [{ role: "user", content: "Write the note" }];
    const first = await agent.generate({ messages });

    const approvalRequests = first.content.filter((part) => part.type === "tool-approval-request");
    expect(approvalRequests).toHaveLength(1);
    await expect(readFile(target, "utf8")).rejects.toThrow();

    messages.push(...first.responseMessages);
    messages.push({
      role: "tool",
      content: approvalRequests.map(
        (part): ToolApprovalResponse => ({
          type: "tool-approval-response",
          approvalId: (part as { approvalId: string }).approvalId,
          approved: true,
        }),
      ),
    });

    await agent.generate({ messages });
    await expect(readFile(target, "utf8")).resolves.toBe("written");
  });

  it("never runs the command when the approval is denied", async () => {
    const cwd = await makeTempDir();
    const target = path.join(cwd, "denied.txt");
    const agent = createAgent({
      chatId: `chat-${crypto.randomUUID()}`,
      configuredCwd: cwd,
      toolName: "terminalRun",
      input: { command: `echo nope > ${JSON.stringify(target)}` },
      withApproval: true,
    });

    const messages: ModelMessage[] = [{ role: "user", content: "Run it" }];
    const first = await agent.generate({ messages });
    const approvalRequest = first.content.find((part) => part.type === "tool-approval-request");
    expect(approvalRequest).toBeDefined();

    messages.push(...first.responseMessages);
    messages.push({
      role: "tool",
      content: [
        {
          type: "tool-approval-response",
          approvalId: (approvalRequest as { approvalId: string }).approvalId,
          approved: false,
        } satisfies ToolApprovalResponse,
      ],
    });

    await agent.generate({ messages });
    await expect(readFile(target, "utf8")).rejects.toThrow();
  });

  it("runs immediately when no approval policy is configured", async () => {
    const cwd = await makeTempDir();
    const target = path.join(cwd, "auto.txt");
    const agent = createAgent({
      chatId: `chat-${crypto.randomUUID()}`,
      configuredCwd: cwd,
      toolName: "terminalWriteFile",
      input: { path: target, content: "auto" },
      withApproval: false,
    });

    const result = await agent.generate({ messages: [{ role: "user", content: "Write it" }] });

    expect(result.content.some((part) => part.type === "tool-approval-request")).toBe(false);
    await expect(readFile(target, "utf8")).resolves.toBe("auto");
  });
});
