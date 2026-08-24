import assert from "node:assert/strict";
import { DEFAULT_CLOUD_API_BASE_URL, getConfiguredCloudApiBaseUrl } from "../src/services/cloudEndpoint.js";

assert.equal(DEFAULT_CLOUD_API_BASE_URL, "https://daily-digital.kuanghong.workers.dev");
assert.equal(getConfiguredCloudApiBaseUrl(), DEFAULT_CLOUD_API_BASE_URL);

console.log("cloud endpoint regression tests passed");
