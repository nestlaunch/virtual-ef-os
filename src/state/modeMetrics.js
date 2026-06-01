export function removeAccountsFromByAccount(metrics = {}, accountIds = []) {
  const removedIds = new Set(accountIds);
  return {
    ...(metrics || {}),
    byAccount: Object.fromEntries(
      Object.entries(metrics?.byAccount || {}).filter(([accountId]) => !removedIds.has(accountId)),
    ),
  };
}
