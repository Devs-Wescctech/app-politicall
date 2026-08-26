// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WhatsappConnectionsSummary } from "./whatsapp-connections-summary";

afterEach(cleanup);

describe("WhatsappConnectionsSummary", () => {
  it("renders safe connection details and opens the canonical manager", () => {
    const onOpenManager = vi.fn();
    render(<WhatsappConnectionsSummary
      state="success"
      connections={[{
        id: "connection-1",
        name: "Gabinete",
        phoneNumber: "5551999990000",
        provider: "wescctech",
        status: "connected",
        lastTestedAt: "2026-08-17T12:00:00.000Z",
        lastError: null,
        type: "whu",
      }]}
      onOpenManager={onOpenManager}
    />);

    expect(screen.getByText("Gabinete")).toBeTruthy();
    expect(screen.getByText("5551999990000")).toBeTruthy();
    expect(screen.queryByTestId("input-whatsapp-token")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /gerenciar números/i }));
    expect(onOpenManager).toHaveBeenCalledOnce();
  });

  it.each([
    ["loading", /carregando conexões/i],
    ["empty", /nenhum número configurado/i],
    ["forbidden", /sem permissão/i],
    ["error", /não foi possível carregar/i],
  ] as const)("renders the %s state explicitly", (state, expected) => {
    render(<WhatsappConnectionsSummary state={state} connections={[]} onOpenManager={() => undefined} />);
    expect(screen.getByText(expected)).toBeTruthy();
  });
});
