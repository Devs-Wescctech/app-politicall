import type { ChannelConnection } from "@shared/schema";
import { isDirectMetaConnection } from "@shared/attendance-meta-window";

export type AttendanceSyncFailure = {
  connectionId: string;
  connectionName: string;
  message: string;
};

export type AttendanceSyncResult = {
  attempted: number;
  succeeded: number;
  failures: AttendanceSyncFailure[];
};

function isWhuManagedConnection(connection: ChannelConnection): boolean {
  const provider = String(connection.provider ?? "").toLowerCase();
  const channel = String(connection.channel ?? "").toLowerCase();
  return provider.includes("wescctech") || provider.includes("whu") || channel.includes("whu");
}

export function isWhuAttendanceSyncConnection(connection: ChannelConnection): boolean {
  return String(connection.status ?? "").toLowerCase() === "connected"
    && !isDirectMetaConnection(connection)
    && isWhuManagedConnection(connection);
}

function syncFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/auth_03|channel cannot be found|token não corresponde a um canal whu/i.test(message)) {
    return "O token não corresponde a um canal WHU ativo. Revise ou teste esta conexão.";
  }
  return message || "Não foi possível sincronizar esta conexão.";
}

export async function syncWhuAttendanceConnections(
  connections: ChannelConnection[],
  syncConnection: (connectionId: string) => Promise<unknown>,
): Promise<AttendanceSyncResult> {
  const targets = connections.filter(isWhuAttendanceSyncConnection);
  const failures: AttendanceSyncFailure[] = [];
  let succeeded = 0;

  // Sequential requests avoid multiplying the provider load when an account has several numbers.
  for (const connection of targets) {
    try {
      await syncConnection(connection.id);
      succeeded += 1;
    } catch (error) {
      failures.push({
        connectionId: connection.id,
        connectionName: connection.name,
        message: syncFailureMessage(error),
      });
    }
  }

  return { attempted: targets.length, succeeded, failures };
}
