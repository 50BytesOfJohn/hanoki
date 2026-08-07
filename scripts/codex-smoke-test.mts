/**
 * Smoke test for the Codex (ChatGPT login) provider.
 *
 * Reads the local `codex login` credentials, lists the models the ChatGPT
 * backend offers, and runs one short streaming completion through the same
 * resolver the app uses.
 *
 * Run with: pnpm exec tsx scripts/codex-smoke-test.ts [model-slug]
 */
import { generateText, stepCountIs, streamText, tool } from "ai";
import { z } from "zod";
import { getCodexCredentials } from "../src/main-process/providers/codex-auth";
import { fetchCodexModels } from "../src/main-process/providers/codex-models";
import { createCodexLanguageModel } from "../src/main-process/server/providers/resolvers/codex-language-model";

const credentials = await getCodexCredentials();
console.info(
  `Signed in as ${credentials.email ?? "unknown"}${
    credentials.planType ? ` (${credentials.planType} plan)` : ""
  }`,
);

const models = await fetchCodexModels(credentials, { forceRefresh: true });
console.info("\nModels:");
for (const model of models) {
  console.info(
    `  ${model.slug.padEnd(22)} ${model.displayName.padEnd(18)} instructions: ${
      model.instructions ? `${model.instructions.length} chars` : "MISSING"
    }`,
  );
}

const slug = process.argv[2] ?? models[0].slug;
console.info(`\nStreaming from "${slug}"...\n`);

const result = streamText({
  model: await createCodexLanguageModel({
    providerRow: { id: "smoke-test" } as never,
    providerRuntime: { providerDef: { id: "codex" }, parsedConfig: {} } as never,
    providerModelId: slug,
  }),
  instructions: "Reply in exactly one short sentence.",
  prompt: "Say hello and name the model you are.",
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}

console.info(`\n\nUsage: ${JSON.stringify(await result.usage)}`);

const model = await createCodexLanguageModel({
  providerRow: { id: "smoke-test" } as never,
  providerRuntime: { providerDef: { id: "codex" }, parsedConfig: {} } as never,
  providerModelId: slug,
});

console.info("\nNon-streaming (title generation path)...");
const generated = await generateText({
  model,
  instructions: "Answer with a single word.",
  prompt: "What colour is a clear midday sky?",
});
console.info(`  -> ${generated.text.trim()}`);

console.info("\nTool call...");
const toolResult = await generateText({
  model,
  prompt: "What is the weather in Warsaw? Use the tool.",
  tools: {
    get_weather: tool({
      description: "Get the current weather for a city.",
      inputSchema: z.object({ city: z.string() }),
      execute: ({ city }) => `It is 21C and sunny in ${city}.`,
    }),
  },
  stopWhen: stepCountIs(3),
});
console.info(`  -> calls: ${JSON.stringify(toolResult.staticToolCalls.map((call) => call.input))}`);
console.info(`  -> ${toolResult.text.trim()}`);
