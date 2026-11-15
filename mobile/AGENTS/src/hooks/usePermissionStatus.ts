import { useCallback, useEffect, useState } from 'react';
import { getPermission, onAppForeground, type PermissionInfo, type PermissionKind } from '../services/permissions/permissionService';

/** The live state of one permission. Rechecked on mount and every time the app returns to the foreground (for example from Settings). */
export function usePermissionStatus(kind: PermissionKind) {
  const [info, setInfo] = useState<PermissionInfo | null>(null);
  const refresh = useCallback(() => getPermission(kind).then(setInfo).catch(() => {}), [kind]);
  useEffect(() => {
    refresh();
    return onAppForeground(refresh);
  }, [refresh]);
  return { info, refresh };
}
