import fs from "node:fs";
import crypto from "node:crypto";
import readline from "node:readline";

import { createClient } from "@supabase/supabase-js";

function normalizeTitleKey(value) {
  return (value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAniListId(sources) {
  if (!Array.isArray(sources)) {
    return null;
  }

  for (const source of sources) {
    const match = /^https:\/\/anilist\.co\/anime\/(\d+)/.exec(source);

    if (match) {
      return Number(match[1]);
    }
  }

  return null;
}

function buildSourceFingerprint(row) {
  const parts = [
    normalizeTitleKey(row.title),
    row.type || "",
    row.animeSeason?.year || "",
    row.episodes || "",
    row.picture || "",
  ];

  return `dataset:${parts.join(":")}`;
}

function createStableHash(value) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 12);
}

function assignSourceFingerprint(baseFingerprint, rawLine, usedFingerprints) {
  if (!usedFingerprints.has(baseFingerprint)) {
    usedFingerprints.add(baseFingerprint);
    return baseFingerprint;
  }

  const hashedFingerprint = `${baseFingerprint}:${createStableHash(rawLine)}`;

  if (!usedFingerprints.has(hashedFingerprint)) {
    usedFingerprints.add(hashedFingerprint);
    return hashedFingerprint;
  }

  let suffix = 2;

  while (true) {
    const candidate = `${hashedFingerprint}:${suffix}`;

    if (!usedFingerprints.has(candidate)) {
      usedFingerprints.add(candidate);
      return candidate;
    }

    suffix += 1;
  }
}

function toAnimeRow(row, sourceFingerprint) {
  const anilistId = parseAniListId(row.sources);

  return {
    anilist_id: anilistId,
    source_fingerprint: anilistId ? null : sourceFingerprint,
    source_provider: "anime-offline-database",
    source_urls: Array.isArray(row.sources) ? row.sources : [],
    title_display: row.title,
    title_normalized: normalizeTitleKey(row.title),
    synonyms: Array.isArray(row.synonyms) ? row.synonyms : [],
    studios: Array.isArray(row.studios) ? row.studios : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    cover_image: row.picture || row.thumbnail || null,
    format: row.type || null,
    status: row.status || null,
    episodes: typeof row.episodes === "number" ? row.episodes : null,
    season: row.animeSeason?.season || null,
    season_year: row.animeSeason?.year || null,
    average_score:
      typeof row.score?.arithmeticMean === "number"
        ? Math.round(row.score.arithmeticMean * 10)
        : null,
    metadata_tier: "basic",
    last_synced_at: new Date().toISOString(),
  };
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const datasetPath = process.env.DATASET_PATH || "dataset/anime-offline-database.jsonl";

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  if (!fs.existsSync(datasetPath)) {
    throw new Error(`Dataset file not found: ${datasetPath}`);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const stream = fs.createReadStream(datasetPath, "utf8");
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let batch = [];
  let inserted = 0;
  const usedFingerprints = new Set();

  async function flush() {
    if (!batch.length) {
      return;
    }

    const withAniListId = batch.filter((row) => row.anilist_id);
    const withoutAniListId = batch.filter((row) => !row.anilist_id);

    if (withAniListId.length) {
      const { error } = await supabase
        .from("anime")
        .upsert(withAniListId, { onConflict: "anilist_id" });

      if (error) {
        throw error;
      }
    }

    if (withoutAniListId.length) {
      const { error } = await supabase
        .from("anime")
        .upsert(withoutAniListId, { onConflict: "source_fingerprint" });

      if (error) {
        throw error;
      }
    }

    inserted += batch.length;
    process.stdout.write(`Seeded ${inserted} rows\r`);
    batch = [];
  }

  for await (const line of rl) {
    if (!line.trim()) {
      continue;
    }

    const row = JSON.parse(line);

    if (row.$schema) {
      continue;
    }

    const baseFingerprint = buildSourceFingerprint(row);
    const sourceFingerprint = assignSourceFingerprint(
      baseFingerprint,
      line,
      usedFingerprints,
    );

    batch.push(toAnimeRow(row, sourceFingerprint));

    if (batch.length >= 500) {
      await flush();
    }
  }

  await flush();
  process.stdout.write("\n");
  console.log(`Finished seeding dataset rows from ${datasetPath}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
