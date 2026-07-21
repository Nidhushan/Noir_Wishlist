import { describe, expect, it } from "vitest";

import type { CatalogAnimeRecord } from "./anime-write-types";
import { isAnimeDetailFresh } from "./anime-freshness";

function record(overrides: Partial<CatalogAnimeRecord>): CatalogAnimeRecord {
  return {
    metadata_tier: "detail",
    detail_synced_at: "2026-07-18T00:00:00.000Z",
    ...overrides,
  } as CatalogAnimeRecord;
}

describe("isAnimeDetailFresh", () => {
  const now = new Date("2026-07-19T00:00:00.000Z");

  it("accepts detail metadata inside the freshness window", () => {
    expect(isAnimeDetailFresh(record({}), 48 * 60 * 60 * 1000, now)).toBe(true);
  });

  it("rejects stale, basic, missing, and future timestamps", () => {
    expect(isAnimeDetailFresh(record({}), 12 * 60 * 60 * 1000, now)).toBe(false);
    expect(isAnimeDetailFresh(record({ metadata_tier: "basic" }), Infinity, now)).toBe(false);
    expect(isAnimeDetailFresh(record({ detail_synced_at: null }), Infinity, now)).toBe(false);
    expect(
      isAnimeDetailFresh(
        record({ detail_synced_at: "2026-07-20T00:00:00.000Z" }),
        Infinity,
        now,
      ),
    ).toBe(false);
  });
});
