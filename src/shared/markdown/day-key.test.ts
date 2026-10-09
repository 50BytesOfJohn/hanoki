import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";

import { localDayKey } from "./day-key";

describe("localDayKey", () => {
  it("keys the local calendar day across the Warsaw DST dates", () => {
    vi.useFakeTimers();
    try {
      for (const [year, month, day] of [
        [2026, 2, 29],
        [2026, 9, 25],
      ] as const) {
        const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        vi.setSystemTime(new Date(year, month, day, 0, 30, 0));
        expect(localDayKey(new Date())).toBe(key);
        vi.setSystemTime(new Date(year, month, day, 23, 30, 0));
        expect(localDayKey(new Date())).toBe(key);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses Europe/Warsaw for the spring-forward and fall-back midnights", () => {
    const script = `
      const { localDayKey } = await import(${JSON.stringify(new URL("./day-key.ts", import.meta.url).href)});
      const springEarly = localDayKey(new Date("2026-03-29T00:30:00+01:00"));
      const springLate = localDayKey(new Date("2026-03-29T04:30:00+02:00"));
      const fallEarly = localDayKey(new Date("2026-10-25T00:30:00+02:00"));
      const fallAgain = localDayKey(new Date("2026-10-25T02:30:00+01:00"));
      const fallLate = localDayKey(new Date("2026-10-25T04:30:00+01:00"));
      console.log([springEarly, springLate, fallEarly, fallAgain, fallLate].join(","));
    `;
    const result = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "--input-type=module", "-e", script],
      {
        env: { ...process.env, TZ: "Europe/Warsaw" },
        encoding: "utf8",
      },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("2026-03-29,2026-03-29,2026-10-25,2026-10-25,2026-10-25");
  });
});
