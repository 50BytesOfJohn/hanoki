import { describe, expect, it } from "vitest";
import { type ChatTreeSortEntry, sortChatTreeEntries } from "./chat-tree-sort";

function entry(
  name: string,
  isFolder: boolean,
  createdAt: number,
  updatedAt: number,
): ChatTreeSortEntry<string> {
  return { isFolder, key: { name, createdAt, updatedAt }, value: name };
}

const entries = [
  entry("beta folder", true, 2, 20),
  entry("Alpha folder", true, 3, 10),
  entry("Chat 10", false, 1, 30),
  entry("chat 2", false, 4, 5),
];

describe("chat tree sort", () => {
  it("groups folders first and sorts names naturally, ignoring case", () => {
    expect(sortChatTreeEntries(entries, "name-asc", "first")).toEqual([
      "Alpha folder",
      "beta folder",
      "chat 2",
      "Chat 10",
    ]);
  });

  it("puts folders last without changing the within-group order", () => {
    expect(sortChatTreeEntries(entries, "name-asc", "last")).toEqual([
      "chat 2",
      "Chat 10",
      "Alpha folder",
      "beta folder",
    ]);
  });

  it("interleaves folders and chats when mixed", () => {
    expect(sortChatTreeEntries(entries, "updated-desc", "mixed")).toEqual([
      "Chat 10",
      "beta folder",
      "Alpha folder",
      "chat 2",
    ]);
  });

  it("sorts by created date in both directions", () => {
    expect(sortChatTreeEntries(entries, "created-asc", "mixed")).toEqual([
      "Chat 10",
      "beta folder",
      "Alpha folder",
      "chat 2",
    ]);
    expect(sortChatTreeEntries(entries, "created-desc", "mixed")).toEqual([
      "chat 2",
      "Alpha folder",
      "beta folder",
      "Chat 10",
    ]);
  });

  it("breaks timestamp ties by name", () => {
    const tied = [entry("b", false, 1, 1), entry("a", false, 1, 1)];
    expect(sortChatTreeEntries(tied, "updated-desc", "mixed")).toEqual(["a", "b"]);
  });
});
