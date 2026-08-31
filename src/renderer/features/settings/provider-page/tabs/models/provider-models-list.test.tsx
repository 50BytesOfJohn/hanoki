// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ProviderModelInfo } from "@shared/ipc";
import { decorateModel, ProviderModelCard } from "./provider-models-list";

afterEach(cleanup);

/** A verbatim OpenRouter entry, so the card is exercised on a real payload. */
const openRouterModel: ProviderModelInfo = {
  id: "or:tencent/hunyuan-t1",
  providerId: "or",
  providerModelId: "tencent/hunyuan-t1",
  displayName: "Tencent: Hy4 preview",
  isEnabled: true,
  status: "active",
  metadata: {
    id: "tencent/hunyuan-t1",
    created: 1787875200,
    description: "A mixture-of-experts model from Tencent.",
    context_length: 1048576,
    architecture: { input_modalities: ["text", "image"] },
    pricing: { prompt: "0.000000834", completion: "0.000002501" },
    supported_parameters: ["tools"],
  },
};

describe("ProviderModelCard", () => {
  it("renders the creator, date, context and per-million pricing for a model", () => {
    render(<ProviderModelCard entry={decorateModel(openRouterModel, "openrouter")} />);

    expect(screen.getByText("Tencent: Hy4 preview")).toBeDefined();
    expect(screen.getByText("tencent/hunyuan-t1")).toBeDefined();
    expect(screen.getByText("by tencent")).toBeDefined();
    expect(screen.getByText("1.05M context")).toBeDefined();
    expect(screen.getByText("$0.834/M input")).toBeDefined();
    expect(screen.getByText("$2.501/M output")).toBeDefined();
    expect(screen.getByText("A mixture-of-experts model from Tencent.")).toBeDefined();
  });

  it("omits facts the provider did not report", () => {
    const bareModel: ProviderModelInfo = {
      ...openRouterModel,
      id: "ds:deepseek-chat",
      providerModelId: "deepseek-chat",
      displayName: null,
      metadata: { id: "deepseek-chat", object: "model" },
    };

    render(<ProviderModelCard entry={decorateModel(bareModel, "deepseek")} />);

    expect(screen.getByText("by deepseek")).toBeDefined();
    expect(screen.queryByText(/context$/)).toBeNull();
    expect(screen.queryByText(/\/M input$/)).toBeNull();
  });
});
