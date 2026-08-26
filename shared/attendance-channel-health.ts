export const ATTENDANCE_CHANNEL_IDS = ["whatsapp", "sms", "email"] as const;

export type AttendanceChannelId = typeof ATTENDANCE_CHANNEL_IDS[number];
export type AttendanceChannelStatus = "operational" | "warning" | "error" | "inactive";

export type AttendanceChannelHealth = {
  id: AttendanceChannelId;
  label: string;
  status: AttendanceChannelStatus;
  message: string;
  canSend: boolean;
  canReceive: boolean;
  configuredConnections?: number;
  missing?: string[];
  lastCheckedAt?: string | null;
};

export type AttendanceChannelHealthResponse = {
  channels: AttendanceChannelHealth[];
  checkedAt: string;
};

