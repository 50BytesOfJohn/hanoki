import { describe, expect, it } from "vitest";

import { TOOL_APPROVAL_EXPIRED_REASON } from "@shared/ipc";

import {
  TOOL_APPROVAL_SAVE_ERROR,
  settleToolApprovalClick,
  toolDenialLabel,
} from "./tool-approval-response";

describe("tool approval click", () => {
  it("turns a missing or expired allow into a denial the turn can finish", () => {
    expect(settleToolApprovalClick(true, "expired")).toEqual({
      approved: false,
      reason: TOOL_APPROVAL_EXPIRED_REASON,
      notice: TOOL_APPROVAL_EXPIRED_REASON,
    });
    expect(toolDenialLabel(TOOL_APPROVAL_EXPIRED_REASON)).toBe("This request expired, ask again");
  });

  it("keeps a user denial when the server has no record", () => {
    expect(settleToolApprovalClick(false, "denied", "The user did not allow this action.")).toEqual(
      {
        approved: false,
        reason: "The user did not allow this action.",
        notice: null,
      },
    );
    expect(toolDenialLabel(undefined)).toBe("You didn't allow this");
  });

  it("names the inline error when saving the choice fails", () => {
    expect(TOOL_APPROVAL_SAVE_ERROR).toBe("Couldn't save that choice. Try again.");
  });

  it("passes an allow through when the server recorded it", () => {
    expect(settleToolApprovalClick(true, "approved")).toEqual({
      approved: true,
      notice: null,
    });
  });
});
