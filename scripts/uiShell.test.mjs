import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appSource = await readFile(new URL("../src/app/App.jsx", import.meta.url), "utf8");

assert.equal(appSource.includes("PhoneOrientationPanel"), false, "The global phone orientation tutorial must not be mounted.");
assert.equal(appSource.includes("hasCompletedPhoneOrientation"), false, "App routing must not depend on orientation completion.");
assert.equal(appSource.includes("<SessionEndedOverlay />"), true, "The completion and rating screen must remain available.");
assert.equal(appSource.includes("<LearnTourOverlay />"), true, "Learn guidance must remain available in Learn mode.");
assert.equal(appSource.includes("<PracticeGuidePanel />"), true, "Practice guidance must remain available in Practice mode.");
assert.equal(appSource.includes("<AssessmentTaskPanel />"), true, "Assessment task support must remain available.");
assert.equal(appSource.includes("<FreeTaskPanel />"), true, "Free-mode task support must remain available.");
assert.equal(appSource.includes("const sessionIsEnding = Boolean(state.session.joined && state.session.endingStartedAt)"), true, "Session-ending state must be explicit.");
assert.equal(appSource.includes("const hasCompanionPanel = !sessionIsEnding && hasSideGuide"), true, "The ending screen must remove the companion-panel layout.");
assert.match(appSource, /\{!sessionIsEnding \? \([\s\S]*?<LearnTourOverlay \/>[\s\S]*?<PracticeGuidePanel \/>[\s\S]*?<AssessmentTaskPanel \/>[\s\S]*?<FreeTaskPanel \/>/, "Session ending must suppress all mode support panels.");

console.log("UI shell regression tests passed");
