export const ATTENDANCE_HEARTBEAT_INTERVAL_MS = 30_000;
export const ATTENDANCE_HEARTBEAT_TIMEOUT_MS = 75_000;
export const ATTENDANCE_CONNECT_TIMEOUT_MS = 10_000;
export const ATTENDANCE_MAX_CLIENT_PACKET_CHARS = 256 * 1024;

export type AttendanceConnectedPacket = {
  type: "attendance.realtime.connected";
  connectionId: string;
  userId: string;
  accountId: string;
  heartbeatIntervalMs: number;
  createdAt: string;
};

export type AttendanceHeartbeatPacket = {
  type: "attendance.realtime.heartbeat";
  connectionId: string;
  accountId: string;
  createdAt: string;
};
