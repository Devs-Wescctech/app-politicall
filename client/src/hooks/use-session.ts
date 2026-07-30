import { useEffect, useSyncExternalStore } from "react";
import { sessionClient } from "@/lib/session";

export function useSession() {
  const snapshot = useSyncExternalStore(
    sessionClient.subscribe,
    sessionClient.getSnapshot,
    sessionClient.getSnapshot,
  );

  useEffect(() => {
    void sessionClient.bootstrap();
  }, []);

  return snapshot;
}
