/** In-flight workflow runs by chat; a chat runs one generation at a time. */
const activeRuns = new Map<string, AbortController>();

export function registerWorkflowRun(chatId: string, controller: AbortController): () => void {
  activeRuns.set(chatId, controller);
  return () => {
    if (activeRuns.get(chatId) === controller) activeRuns.delete(chatId);
  };
}

/**
 * Stops the run but keeps its response open: finished steps keep their
 * output, a writing step keeps its partial text, and the message is written
 * from what is there. Returns false when the chat has no run in flight.
 */
export function stopWorkflowRun(chatId: string): boolean {
  const controller = activeRuns.get(chatId);
  if (!controller) return false;
  controller.abort();
  return true;
}
