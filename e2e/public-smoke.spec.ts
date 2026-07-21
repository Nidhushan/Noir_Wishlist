import { expect, test } from "@playwright/test";

test("short searches render validation without contacting the catalog", async ({ page }) => {
  await page.goto("/search?q=a");

  await expect(
    page.getByRole("heading", { name: "Search terms need at least two characters." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Noir" })).toBeVisible();
  await expect(page).toHaveTitle(/Noir/);
});

test("invalid anime identifiers use the application not-found page", async ({ page }) => {
  await page.goto("/anime/not-an-anilist-id");

  await expect(
    page.getByRole("heading", { name: "That anime page does not exist." }),
  ).toBeVisible();
});

test("notification processing rejects unauthenticated callers", async ({ request }) => {
  const response = await request.get("/api/internal/notifications/process");

  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
});
