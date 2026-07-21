import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ collect: vi.fn(), processBatch: vi.fn() }));

vi.mock("@/lib/notifications/collector", () => ({
  collectTrackedAnimeNotifications: mocks.collect,
}));

vi.mock("@/lib/notifications/worker", () => ({
  processNotificationObservationBatch: mocks.processBatch,
}));

import { GET } from "./route";

describe("notification processing route", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret-123");
    mocks.collect.mockReset();
    mocks.collect.mockResolvedValue({
      status: "collected",
      runId: 1,
      targets: 2,
      fetched: 2,
      observations: 1,
      queued: 1,
      batches: 1,
    });
    mocks.processBatch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects requests without the cron bearer token", async () => {
    const response = await GET(new Request("http://localhost/api/internal/notifications/process"));

    expect(response.status).toBe(401);
    expect(mocks.collect).not.toHaveBeenCalled();
    expect(mocks.processBatch).not.toHaveBeenCalled();
  });

  it("rejects differently encoded tokens without throwing", async () => {
    const response = await GET(
      new Request("http://localhost/api/internal/notifications/process", {
        headers: { authorization: "Bearer test-cron-secret-12é" },
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.processBatch).not.toHaveBeenCalled();
  });

  it("processes an authenticated request", async () => {
    mocks.processBatch.mockResolvedValue({
      status: "processed",
      processed: 1,
      baselined: 0,
      ignored: 0,
      eventsCreated: 1,
      notificationsCreated: 2,
      retried: 0,
      deadLettered: 0,
      remaining: 0,
    });
    const response = await GET(
      new Request("http://localhost/api/internal/notifications/process", {
        headers: { authorization: "Bearer test-cron-secret-123" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "processed",
      collection: { targets: 2, queued: 1 },
      processed: 1,
      notificationsCreated: 2,
    });
  });

  it("drains queued work and reports a failed collection", async () => {
    mocks.collect.mockRejectedValue(new Error("AniList unavailable"));
    mocks.processBatch.mockResolvedValue({
      status: "processed",
      processed: 1,
      baselined: 1,
      ignored: 0,
      eventsCreated: 0,
      notificationsCreated: 0,
      retried: 0,
      deadLettered: 0,
      remaining: 0,
    });

    const response = await GET(
      new Request("http://localhost/api/internal/notifications/process", {
        headers: { authorization: "Bearer test-cron-secret-123" },
      }),
    );

    expect(response.status).toBe(502);
    expect(mocks.processBatch).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toMatchObject({
      status: "collection_failed",
      collection: null,
      processed: 1,
    });
  });
});
