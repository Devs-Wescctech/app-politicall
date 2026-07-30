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

  it("supports keyboard retry and prevents a duplicate retry while busy", async () => {
    const retry = vi.fn();

    function RetryHarness() {
      const [retryInProgress, setRetryInProgress] = useState(false);
      return createElement(ConnectionStatus, {
        mode: "fallback",
        retryInProgress,
        onRetry: () => {
          retry();
          setRetryInProgress(true);
        },
      });
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
  });

  it("retries a failed chat detail read without sending, clearing cached messages, or changing the draft", async () => {
    const reconnectNow = vi.fn();
    const refetch = vi.fn().mockResolvedValue({ data: undefined });
    const sendMutation = vi.fn();
    const cachedMessages = [{ id: "cached-1", body: "Mensagem preservada" }];
    const draft = "Rascunho preservado";
    const user = userEvent.setup();

    render(createElement(ConnectionStatus, {
      mode: "connected",
      httpRefreshFailed: true,
      onRetry: retryChatDetailRefresh(reconnectNow, refetch),
    }));

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(reconnectNow).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(sendMutation).not.toHaveBeenCalled();
    expect(cachedMessages).toEqual([{ id: "cached-1", body: "Mensagem preservada" }]);
    expect(draft).toBe("Rascunho preservado");
  });
});
