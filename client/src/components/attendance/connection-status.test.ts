// @vitest-environment jsdom
import { createElement, useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectionStatus } from "./ConnectionStatus";
import { retryChatDetailRefresh } from "./ChatPanel";

afterEach(cleanup);

describe("ConnectionStatus", () => {
  it("announces each realtime mode through one polite atomic live region", () => {
    const { rerender } = render(createElement(ConnectionStatus, { mode: "connected" }));
    const status = screen.getByRole("status");

    expect(status.textContent).toContain("Conectado");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.getAttribute("aria-atomic")).toBe("true");
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).toBeNull();

    rerender(createElement(ConnectionStatus, { mode: "reconnecting" }));
    expect(screen.getByRole("status")).toBe(status);
    expect(status.textContent).toContain("Reconectando");
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeTruthy();

    rerender(createElement(ConnectionStatus, { mode: "fallback" }));
    expect(screen.getByRole("status")).toBe(status);
    expect(status.textContent).toContain("Sincronização automática");
  });

  it("prioritizes a HTTP refresh failure and exposes a retry action", () => {
    render(createElement(ConnectionStatus, {
      mode: "connected",
      httpRefreshFailed: true,
      onRetry: vi.fn(),
    }));

    expect(screen.getByRole("status").textContent).toContain("Falha ao atualizar");
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInstanceOf(HTMLButtonElement);
  });

  it("keeps page retry busy through the real reconnecting mode and releases it after a later fallback", async () => {
    const retry = vi.fn();

    function RetryHarness() {
      const [mode, setMode] = useState<"connected" | "reconnecting" | "fallback">("fallback");
      return createElement("div", undefined,
        createElement(ConnectionStatus, {
          mode,
          retryInProgress: mode === "reconnecting",
          onRetry: () => {
            retry();
            setMode("reconnecting");
          },
        }),
        createElement("button", { type: "button", onClick: () => setMode("fallback") }, "Simular fallback"),
        createElement("button", { type: "button", onClick: () => setMode("connected") }, "Simular conexão"),
      );
    }

    const user = userEvent.setup();
    render(createElement(RetryHarness));
    const button = screen.getByRole("button", { name: "Tentar novamente" });

    button.focus();
    await user.keyboard("{Enter}");
    await user.click(button);

    expect(retry).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");

    await user.click(screen.getByRole("button", { name: "Simular fallback" }));
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(retry).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole("button", { name: "Simular conexão" }));
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).toBeNull();
  });

  it("wires a chat retry only to reconnect and the read-only refetch", () => {
    const reconnectNow = vi.fn();
    const refetch = vi.fn().mockResolvedValue({ data: undefined });

    retryChatDetailRefresh(reconnectNow, refetch)();

    expect(reconnectNow).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("can unmount while a retry callback remains pending without a late state update", async () => {
    let resolveRetry: (() => void) | undefined;
    const retry = vi.fn(() => new Promise<void>(resolve => {
      resolveRetry = resolve;
    }));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const user = userEvent.setup();
    const { unmount } = render(createElement(ConnectionStatus, { mode: "fallback", onRetry: retry }));

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    unmount();
    resolveRetry?.();
    await Promise.resolve();

    expect(retry).toHaveBeenCalledTimes(1);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
