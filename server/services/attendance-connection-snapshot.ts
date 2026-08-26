export interface AttendanceConnectionLike {
  name?: string | null;
  metadata?: unknown;
}

export interface AttendanceConnectionSnapshot {
  inboundConnectionName: string | null;
  inboundNumber: string | null;
}

export function snapshotAttendanceConnection(connection?: AttendanceConnectionLike | null): AttendanceConnectionSnapshot {
  if (!connection) return { inboundConnectionName: null, inboundNumber: null };
  const metadata = connection.metadata && typeof connection.metadata === "object"
    ? connection.metadata as Record<string, unknown>
    : {};
  const number = [metadata.phoneNumber, metadata.whatsappPhoneNumber, metadata.number, metadata.identifier]
    .map((value) => String(value ?? "").trim())
    .find(Boolean) ?? null;
  return {
    inboundConnectionName: String(connection.name ?? "").trim() || null,
    inboundNumber: number,
  };
}
