import type { LanguageModel } from "ai";
import type { ProviderTableRow } from "../../providers/repository";
import type { ResolvedProviderRuntimeContext } from "../../providers/runtime-config";

export interface CreateLanguageModelInput {
  providerRow: ProviderTableRow;
  providerRuntime: ResolvedProviderRuntimeContext;
  providerModelId: string;
}

export type LanguageModelResolver = (input: CreateLanguageModelInput) => LanguageModel;
