import { describe, expect, it } from "vitest";
import { selectTemplateConnections } from "./attendance-template-selection";

const connections = [
  { id: "disabled", channel: "whatsapp", status: "disabled" },
  { id: "whu", channel: "whatsapp", status: "connected" },
  { id: "cloud", channel: "whatsapp", status: "connected" },
];

describe("selectTemplateConnections", () => {
  it("uses every active WhatsApp connection for a legacy conversation", () => {
    expect(selectTemplateConnections(connections).map(item => item.id)).toEqual(["whu", "cloud"]);
  });

  it("uses only the explicitly selected connection", () => {
    expect(selectTemplateConnections(connections, "cloud").map(item => item.id)).toEqual(["cloud"]);
  });
});
