export function resolvePatientEntryScreen({ entryMode, onlineAvailable, joined }) {
  if (entryMode === "local-setup") return "local-setup";
  if (entryMode === "local-active") return "simulator";
  if (entryMode === "online-active" && onlineAvailable) {
    return joined ? "simulator" : "online-login";
  }
  return "landing";
}
