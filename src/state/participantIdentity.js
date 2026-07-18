export function deriveParticipantCode(accountId) {
  const normalized = String(accountId || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
  return `DD-${(normalized.slice(-10) || "UNASSIGNED").padStart(10, "0")}`;
}

export function getParticipantCode(account) {
  return account?.participantCode || account?.participant_code || deriveParticipantCode(account?.id || account?.accountId);
}

export function formatParticipantOption(account) {
  const alias = String(account?.alias || account?.label || "User");
  return `${alias} · ${getParticipantCode(account)}`;
}
