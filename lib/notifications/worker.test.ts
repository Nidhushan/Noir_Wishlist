import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc: mocks.rpc }),
}));

import { processNotificationObservationBatch } from "./worker";

describe("processNotificationObservationBatch", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
  });

  it("processes a bounded batch", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        status: "processed",
        processed: 2,
        baselined: 1,
        ignored: 0,
        eventsCreated: 1,
        notificationsCreated: 3,
        retried: 0,
        deadLettered: 0,
        remaining: 0,
      },
      error: null,
    });

    await expect(processNotificationObservationBatch(25)).resolves.toMatchObject({
      processed: 2,
      notificationsCreated: 3,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("process_notification_observation_batch", {
      p_limit: 25,
    });
  });

  it("rejects malformed processor responses", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "processed" }, error: null });

    await expect(processNotificationObservationBatch(10)).rejects.toThrow(
      "invalid counters",
    );
  });
});
