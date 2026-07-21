import type { HomeFeedType } from "./feed-types";

export type CatalogPersistenceErrorCode =
  | "lease_busy"
  | "lease_cooldown"
  | "lease_not_owned"
  | "invalid_payload"
  | "missing_anime"
  | "snapshot_commit_failed"
  | "refresh_state_failed"
  | "database_unavailable";

export class CatalogPersistenceError extends Error {
  constructor(
    readonly code: CatalogPersistenceErrorCode,
    readonly feedType: HomeFeedType,
    readonly page: number,
    readonly retryable: boolean,
    message = "Catalog persistence failed.",
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "CatalogPersistenceError";
  }
}

export function getPersistenceErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    error !== null &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "";
}

export function classifyPersistenceError(error: unknown): CatalogPersistenceErrorCode {
  const message = getPersistenceErrorMessage(error).toLowerCase();

  if (message.includes("lease") && (message.includes("not owned") || message.includes("lost"))) {
    return "lease_not_owned";
  }

  if (message.includes("missing from the catalog")) {
    return "missing_anime";
  }

  if (
    message.includes("json") ||
    message.includes("position") ||
    message.includes("payload") ||
    message.includes("observation")
  ) {
    return "invalid_payload";
  }

  return "snapshot_commit_failed";
}
