export const DEFAULT_CLOUD_API_BASE_URL = "https://daily-digital.kuanghong.workers.dev";

export function getConfiguredCloudApiBaseUrl() {
  return String(import.meta.env?.VITE_API_BASE_URL || DEFAULT_CLOUD_API_BASE_URL).replace(/\/+$/, "");
}
