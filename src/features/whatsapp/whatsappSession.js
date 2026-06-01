export const WHATSAPP_STORAGE_PREFIX = "virtual-os-whatsapp-state-v2";
export const LEGACY_WHATSAPP_STORAGE_KEY = "virtual-os-whatsapp-state-v1";

export function getWhatsAppStorageKey(session, mode = null) {
  const accountId = session.currentUserId || "guest";
  const effectiveMode = mode || session.userModes?.[accountId] || session.mode || "free";
  const assignments = session.assignments?.[accountId] || [];
  const assignment = assignments.filter((item) => item.mode === effectiveMode).at(-1);
  const assignmentId = assignment?.id || `${effectiveMode}-session-${session.startedAt || "new"}`;
  return `${WHATSAPP_STORAGE_PREFIX}:${accountId}:${assignmentId}`;
}

export function clearWhatsAppStorage(storage, activeKey = null) {
  if (!storage) {
    return;
  }
  if (activeKey) {
    storage.removeItem(activeKey);
  }
  storage.removeItem(LEGACY_WHATSAPP_STORAGE_KEY);
}

export function clearAllWhatsAppStorage(storage) {
  if (!storage) {
    return;
  }
  clearWhatsAppStorage(storage);
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key?.startsWith(`${WHATSAPP_STORAGE_PREFIX}:`)) {
      storage.removeItem(key);
    }
  }
}
