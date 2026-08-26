import { describe, expect, it, vi } from "vitest";
import { syncWhuAttendanceConnections } from "./attendance-sync";

describe("syncWhuAttendanceConnections", () => {
  it("syncs every connected WHU connection using its explicit id", async () => {
    const request = vi.fn(async (_connectionId: string) => undefined);

    const result = await syncWhuAttendanceConnections([
      { id: "whu-one", name: "Número 1", status: "connected", channel: "whatsapp", provider: "wescctech", metadata: {} },
      { id: "whu-two", name: "Número 2", status: "connected", channel: "whatsapp", provider: "wescctech_cloud", metadata: {} },
      { id: "meta-direct", name: "Meta", status: "connected", channel: "whatsapp_official", provider: "meta_cloud", metadata: { directMeta: true } },
      { id: "disabled", name: "Desativado", status: "disabled", channel: "whatsapp", provider: "wescctech", metadata: {} },
    ] as any, request);

    expect(request.mock.calls).toEqual([["whu-one"], ["whu-two"]]);
    expect(result).toEqual({ attempted: 2, succeeded: 2, failures: [] });
  });

  it("continues syncing the remaining numbers when one WHU token is invalid", async () => {
    const request = vi.fn(async (connectionId: string) => {
      if (connectionId === "stale-token") throw new Error('Wescctech 400: {"msg":"Channel cannot be found","errorCode":"auth_03"}');
    });

    const result = await syncWhuAttendanceConnections([
      { id: "stale-token", name: "Número antigo", status: "connected", channel: "whatsapp", provider: "wescctech", metadata: {} },
      { id: "current-token", name: "Número atual", status: "connected", channel: "whatsapp", provider: "wescctech", metadata: {} },
    ] as any, request);

    expect(request.mock.calls).toEqual([["stale-token"], ["current-token"]]);
    expect(result.attempted).toBe(2);
    expect(result.succeeded).toBe(1);
    expect(result.failures).toEqual([{
      connectionId: "stale-token",
      connectionName: "Número antigo",
      message: "O token não corresponde a um canal WHU ativo. Revise ou teste esta conexão.",
    }]);
  });
});
