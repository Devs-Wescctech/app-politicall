import { describe, expect, it } from "vitest";
import {
  getMetaWindowState,
  isDirectMetaConnection,
  isOfficialAttendanceChannel,
  isWhuCloudChannelInfo,
} from "./attendance-meta-window";

describe("isOfficialAttendanceChannel", () => {
  it("recognizes an explicit Meta Cloud provider", () => {
    expect(isOfficialAttendanceChannel({ connection: { provider: "meta_cloud" } })).toBe(true);
  });

  it("recognizes official connection metadata", () => {
    expect(isOfficialAttendanceChannel({ connection: { provider: "wescctech", metadata: { apiType: "official" } } })).toBe(true);
  });

  it("recognizes WHU WACLOUD remote channel type 3", () => {
    expect(isOfficialAttendanceChannel({ conversation: { metadata: { remote: { channelType: 3 } } } })).toBe(true);
    expect(isOfficialAttendanceChannel({ conversation: { metadata: { remote: { data: { channel: { type: 3 } } } } } })).toBe(true);
    expect(isOfficialAttendanceChannel({ connection: { metadata: { channelType: 3 } } })).toBe(true);
  });

  it("does not mistake WHU filter type 0 or normal WhatsApp type 1 for Cloud", () => {
    expect(isOfficialAttendanceChannel({ conversation: { metadata: { remote: { channelType: 0 } } } })).toBe(false);
    expect(isOfficialAttendanceChannel({ conversation: { metadata: { remote: { channelType: 1 } } } })).toBe(false);
  });

  it("recognizes Cloud credentials kept in legacy WHU metadata", () => {
    expect(isOfficialAttendanceChannel({
      connection: { provider: "wescctech", metadata: { phoneNumberId: "phone", businessAccountId: "waba" } },
    })).toBe(true);
  });

  it("recognizes WACLOUD ids even when stale metadata says WHU/type 4", () => {
    expect(isOfficialAttendanceChannel({
      connection: {
        provider: "wescctech",
        channel: "whatsapp",
        metadata: {
          apiType: "whu",
          channelType: 4,
          phoneNumberId: "phone",
          businessAccountId: "waba",
        },
      },
    })).toBe(true);
  });
});

describe("isWhuCloudChannelInfo", () => {
  it("recognizes WACLOUD by fields that WHU documents as Cloud-only", () => {
    expect(isWhuCloudChannelInfo({ type: 4, numberId: "phone" })).toBe(true);
    expect(isWhuCloudChannelInfo({ type: 4, wabaId: "waba" })).toBe(true);
    expect(isWhuCloudChannelInfo({ type: 4, metaAccessToken: "present" })).toBe(true);
  });

  it("keeps a regular WHU channel normal when Cloud-only fields are absent", () => {
    expect(isWhuCloudChannelInfo({ type: 4, id: "channel" })).toBe(false);
  });
});

describe("isDirectMetaConnection", () => {
  it("separates direct Graph credentials from WHU-operated WACLOUD", () => {
    expect(isDirectMetaConnection({ provider: "meta_cloud" })).toBe(true);
    expect(isDirectMetaConnection({ provider: "wescctech_cloud", metadata: { channelType: 3 } })).toBe(false);
  });
});

describe("getMetaWindowState", () => {
  const now = new Date("2026-07-13T12:00:00.000Z");
  const official = { provider: "meta_cloud" };

  it("keeps the window open before 24 hours", () => {
    const state = getMetaWindowState({
      connection: official,
      conversation: { lastCustomerActivityAt: "2026-07-12T12:01:00.000Z" },
    }, now);
    expect(state.expired).toBe(false);
  });

  it("expires the window at exactly 24 hours", () => {
    const state = getMetaWindowState({
      connection: official,
      conversation: { lastCustomerActivityAt: "2026-07-12T12:00:00.000Z" },
    }, now);
    expect(state.expired).toBe(true);
    expect(state.expiresAt).toBe("2026-07-13T12:00:00.000Z");
  });

  it("requires a template when an official conversation has no known inbound activity", () => {
    expect(getMetaWindowState({ connection: official, conversation: {} }, now).expired).toBe(true);
  });

  it("never applies the Meta block to a normal WHU channel", () => {
    const state = getMetaWindowState({
      connection: { provider: "wescctech" },
      conversation: { lastCustomerActivityAt: "2020-01-01T00:00:00.000Z" },
    }, now);
    expect(state).toMatchObject({ official: false, expired: false });
  });
});
