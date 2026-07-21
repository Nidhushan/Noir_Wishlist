export type CatalogAnimeWriteErrorCode =
  | "database_unavailable"
  | "invalid_payload"
  | "invalid_response"
  | "identity_conflict"
  | "upsert_failed";

export class CatalogAnimeWriteError extends Error {
  constructor(
    readonly code: CatalogAnimeWriteErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "CatalogAnimeWriteError";
  }
}

export function classifyCatalogAnimeWriteError(error: unknown): CatalogAnimeWriteErrorCode {
  const message =
    error !== null && typeof error === "object" && "message" in error
      ? String(error.message).toLowerCase()
      : "";

  if (message.includes("identity") || message.includes("anilist identity")) {
    return "identity_conflict";
  }

  if (
    message.includes("json") ||
    message.includes("record") ||
    message.includes("title") ||
    message.includes("metadata tier")
  ) {
    return "invalid_payload";
  }

  return "upsert_failed";
}
