// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReasoningEffort } from "@shared/models/reasoning";

import { Popover } from "@/components/ui/popover";
import { TooltipProvider } from "@/components/ui/tooltip";

import { EffortControl, EffortPopoverContent } from "./effort-control";

afterEach(cleanup);

const OFFERED: ReasoningEffort[] = ["none", "low", "medium", "high", "xhigh"];

function renderPanel(value: ReasoningEffort | null, onValueChange = vi.fn()) {
  const ui = (nextValue: ReasoningEffort | null) => (
    <Popover open onOpenChange={() => {}}>
      <EffortPopoverContent
        offered={OFFERED}
        value={nextValue}
        onValueChange={onValueChange}
        onDone={() => {}}
      />
    </Popover>
  );

  const result = render(ui(value));
  return {
    onValueChange,
    rerenderWith: (nextValue: ReasoningEffort | null) => result.rerender(ui(nextValue)),
  };
}

function shownEffort() {
  return document.querySelector("output")?.textContent;
}

function thumbValue() {
  return screen.getByRole("slider", { hidden: true }).getAttribute("aria-valuenow");
}

describe("EffortPanel", () => {
  it("keeps showing the picked level while the parent has not updated yet", () => {
    const { onValueChange } = renderPanel("low");

    // Parent is slow: it records the pick but does not re-render with it.
    fireEvent.click(screen.getByRole("button", { name: "High" }));

    expect(onValueChange).toHaveBeenCalledWith("high");
    expect(shownEffort()).toBe("High");
    expect(thumbValue()).toBe("3");
  });

  it("follows the parent again once it confirms the pick", () => {
    const { rerenderWith } = renderPanel("low");

    fireEvent.click(screen.getByRole("button", { name: "High" }));
    rerenderWith("high");
    expect(shownEffort()).toBe("High");

    // A later change from elsewhere must not be masked by the old pick.
    rerenderWith("low");
    expect(shownEffort()).toBe("Low");
    expect(thumbValue()).toBe("1");
  });

  it("keeps showing a level picked with a digit key while the parent is slow", () => {
    const { onValueChange } = renderPanel("low");

    fireEvent.keyDown(screen.getByRole("slider", { hidden: true }), { code: "Digit3" });

    expect(onValueChange).toHaveBeenCalledWith("high");
    expect(shownEffort()).toBe("High");
    expect(thumbValue()).toBe("3");
  });

  it("sends a rapid second pick that returns to the saved level", () => {
    const { onValueChange, rerenderWith } = renderPanel("low");

    fireEvent.click(screen.getByRole("button", { name: "High" }));
    fireEvent.click(screen.getByRole("button", { name: "Low" }));

    expect(onValueChange).toHaveBeenNthCalledWith(1, "high");
    expect(onValueChange).toHaveBeenNthCalledWith(2, "low");
    expect(shownEffort()).toBe("Low");

    // The first save landing must not win over the second pick.
    rerenderWith("high");
    expect(shownEffort()).toBe("Low");
    expect(thumbValue()).toBe("1");

    rerenderWith("low");
    expect(shownEffort()).toBe("Low");
  });

  it("flips the Default switch with the pick, before the parent updates", () => {
    renderPanel("high");

    const toggle = screen.getByRole("switch");
    expect(toggle.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("true");

    // And back: picking a level turns it off again right away.
    fireEvent.click(screen.getByRole("button", { name: "Max" }));
    expect(shownEffort()).toBe("Max");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("stops masking the saved level if the parent never confirms the pick", () => {
    vi.useFakeTimers();
    try {
      renderPanel("low");

      fireEvent.click(screen.getByRole("button", { name: "High" }));
      expect(shownEffort()).toBe("High");

      act(() => vi.advanceTimersByTime(2000));
      expect(shownEffort()).toBe("Low");
      expect(thumbValue()).toBe("1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows Default immediately when the switch is turned on", () => {
    renderPanel("high");

    fireEvent.click(screen.getByRole("switch"));

    expect(shownEffort()).toBe("Default");
    // Thumb rests parked on Medium while Default is in effect.
    expect(thumbValue()).toBe("2");
  });
});

function renderControl(value: ReasoningEffort | null, onValueChange = vi.fn()) {
  const ui = (nextValue: ReasoningEffort | null, open: boolean) => (
    <TooltipProvider>
      <EffortControl
        offered={OFFERED}
        value={nextValue}
        onValueChange={onValueChange}
        open={open}
        onOpenChange={() => {}}
      />
    </TooltipProvider>
  );

  const result = render(ui(value, true));
  return {
    onValueChange,
    rerenderWith: (nextValue: ReasoningEffort | null, open = true) =>
      result.rerender(ui(nextValue, open)),
  };
}

function triggerLabel() {
  return screen.getByRole("button", { name: /^Effort:/ }).getAttribute("aria-label");
}

describe("EffortControl trigger", () => {
  it("shows the pick on the trigger while the parent has not updated yet", () => {
    const { onValueChange } = renderControl("low");

    expect(triggerLabel()).toBe("Effort: Low");

    // Parent is slow: it records the pick but does not re-render with it.
    fireEvent.click(screen.getByRole("button", { name: "High" }));

    expect(onValueChange).toHaveBeenCalledWith("high");
    expect(triggerLabel()).toBe("Effort: High");
  });

  it("keeps showing the pick on the trigger after the popover closes", () => {
    const { rerenderWith } = renderControl("low");

    fireEvent.click(screen.getByRole("button", { name: "High" }));
    // Popover closed before the save landed; the panel unmounts.
    rerenderWith("low", false);

    expect(triggerLabel()).toBe("Effort: High");

    // Once the parent confirms, later changes show again.
    rerenderWith("high", false);
    rerenderWith("low", false);
    expect(triggerLabel()).toBe("Effort: Low");
  });

  it("shows Default on the trigger as soon as it is picked", () => {
    renderControl("high");

    fireEvent.click(screen.getByRole("switch"));

    expect(triggerLabel()).toBe("Effort: Default");
  });
});
