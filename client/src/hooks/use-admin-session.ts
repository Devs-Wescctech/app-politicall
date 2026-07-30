import { useEffect, useSyncExternalStore } from "react";
import { adminSessionClient } from "@/lib/admin-session";

export function useAdminSession() {
  const snapshot = useSyncExternalStore(
    adminSessionClient.subscribe,
    adminSessionClient.getSnapshot,
    adminSessionClient.getSnapshot,
  );
  useEffect(() => { void adminSessionClient.bootstrap(); }, []);
  return snapshot;
}
