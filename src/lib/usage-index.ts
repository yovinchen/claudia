import { invoke } from "@tauri-apps/api/core";

export interface ScanProgress {
  processed: number;
  total: number;
  started_ts: number;
  finished_ts?: number | null;
}

export interface UsageSummary {
  files: number;
  tokens: number;
  lines: number;
  last_scan_ts?: number | null;
}

export interface ImportResult {
  inserted: number;
  skipped: number;
  errors: number;
}

export async function usageScanIndex(projectRoot: string, exclude: string[] = []): Promise<string> {
  return await invoke<string>("usage_scan_index", { projectRoot, exclude });
}

export async function usageScanProgress(jobId: string): Promise<ScanProgress> {
  return await invoke<ScanProgress>("usage_scan_progress", { jobId });
}

export async function usageGetSummary(projectRoot: string): Promise<UsageSummary> {
  return await invoke<UsageSummary>("usage_get_summary", { projectRoot });
}

export async function usageImportDiffs(projectRoot: string, path: string): Promise<ImportResult> {
  return await invoke<ImportResult>("usage_import_diffs", { projectRoot, path });
}

