import { describe, expect, it } from "vitest";
import { snapshotAttendanceConnection } from "./attendance-connection-snapshot";

describe("snapshotAttendanceConnection", () => {
  it.each([
    ["phoneNumber", "+555133330001"],
    ["whatsappPhoneNumber", "+555133330002"],
    ["number", "+555133330003"],
    ["identifier", "+555133330004"],
  ])("extracts the receiver from metadata.%s", (key, value) => {
    expect(snapshotAttendanceConnection({ name: "Gabinete Centro", metadata: { [key]: value } }))
      .toEqual({ inboundConnectionName: "Gabinete Centro", inboundNumber: value });
  });

  it("keeps the connection name when the receiver number is unavailable", () => {
    expect(snapshotAttendanceConnection({ name: "Gabinete Centro", metadata: {} }))
      .toEqual({ inboundConnectionName: "Gabinete Centro", inboundNumber: null });
  });

  it("returns an empty snapshot without a connection", () => {
    expect(snapshotAttendanceConnection(null)).toEqual({ inboundConnectionName: null, inboundNumber: null });
  });
});
