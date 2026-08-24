import assert from "node:assert/strict";
import { resolvePatientEntryScreen } from "../src/state/entryFlow.js";

assert.equal(resolvePatientEntryScreen({ entryMode: "local-setup", onlineAvailable: true, joined: false }), "local-setup");
assert.equal(resolvePatientEntryScreen({ entryMode: "local-active", onlineAvailable: true, joined: false }), "simulator");
assert.equal(resolvePatientEntryScreen({ entryMode: "online-active", onlineAvailable: true, joined: false }), "online-login");
assert.equal(resolvePatientEntryScreen({ entryMode: "online-active", onlineAvailable: true, joined: true }), "simulator");
assert.equal(resolvePatientEntryScreen({ entryMode: "online-active", onlineAvailable: false, joined: false }), "landing");
assert.equal(resolvePatientEntryScreen({ entryMode: "", onlineAvailable: true, joined: false }), "landing");

console.log("entry flow regression tests passed");
