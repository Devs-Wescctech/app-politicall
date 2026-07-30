import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { AttMessage } from "@shared/schema";
import { mergeAttendanceMessages } from "./attendance-reconciliation";

export type AttendanceDetailCache = {
  messages?: AttMessage[];
  [key: string]: unknown;
};

export function mergeAttendanceDetailCache(
  current: AttendanceDetailCache | undefined,
  incoming: AttendanceDetailCache,
): AttendanceDetailCache {
  if (!Array.isArray(incoming.messages)) return incoming;

  const currentMessages = Array.isArray(current?.messages) ? current.messages : [];
  const messages = incoming.messages.reduce(
    (merged, message) => mergeAttendanceMessages(merged, message),
    currentMessages,
  );

  return {
    ...(current ?? {}),
    ...incoming,
    messages,
  };
}

export function createAttendanceDetailQueryFn<TDetail extends AttendanceDetailCache>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  fetchDetail: () => Promise<TDetail>,
): () => Promise<TDetail> {
  return async () => {
    const incoming = await fetchDetail();
    const current = queryClient.getQueryData<AttendanceDetailCache>(queryKey);
    return mergeAttendanceDetailCache(current, incoming) as TDetail;
  };
}
