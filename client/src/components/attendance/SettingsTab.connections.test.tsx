// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  toast: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock("@/lib/queryClient", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queryClient")>("@/lib/queryClient");
  return { ...actual, apiRequest: mocks.apiRequest, queryClient: { invalidateQueries: mocks.invalidateQueries } };
});

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

import SettingsTab from "./SettingsTab";

type Connection = Record<string, unknown> & { id: string; name: string };

const first: Connection = {
  id: "connection-1",
  accountId: "account-1",
  name: "Gabinete",
  channel: "whatsapp",
  provider: "wescctech",
  phoneNumber: "5551999990000",
  status: "connected",
  hasToken: true,
  lastTestedAt: "2026-08-17T12:00:00.000Z",
  lastError: null,
  webhookSetupUrl: "https://politicall.example/api/webhooks/attendance/whatsapp/connection-1",
  metadata: {},
};

const second: Connection = {
  ...first,
  id: "connection-2",
  name: "Campanha",
  phoneNumber: "5551988880000",
  webhookSetupUrl: null,
};

function renderSettings(connections: Connection[] | Promise<Connection[]>) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: ({ queryKey }) => queryKey[0] === "/api/attendance/connections"
          ? Promise.resolve(connections)
          : Promise.resolve([]),
      },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={client}><SettingsTab /></QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  mocks.apiRequest.mockReset();
  mocks.toast.mockReset();
  mocks.invalidateQueries.mockReset();
});

describe("attendance connection manager", () => {
  it("uses only the backend-provided webhook setup value", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderSettings([first, second]);

    await screen.findByText("Gabinete");
    expect(screen.getByDisplayValue(first.webhookSetupUrl as string)).toBeTruthy();
    expect(screen.queryByDisplayValue(/connection-2$/)).toBeNull();
    expect(screen.queryByTestId("button-copy-webhook-connection-2")).toBeNull();

    fireEvent.click(screen.getByTestId("button-copy-webhook-connection-1"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(first.webhookSetupUrl));
  });

  it("keeps test busy state scoped to the exact row", async () => {
    let resolveTest!: (value: unknown) => void;
    let resolveSecondTest!: (value: unknown) => void;
    mocks.apiRequest.mockImplementation((_method, url) => {
      if (url.endsWith("/connection-1/test")) return new Promise(resolve => { resolveTest = resolve; });
      if (url.endsWith("/connection-2/test")) return new Promise(resolve => { resolveSecondTest = resolve; });
      return Promise.resolve({});
    });
    renderSettings([first, second]);

    const firstButton = await screen.findByTestId("button-test-connection-connection-1");
    const secondButton = screen.getByTestId("button-test-connection-connection-2");
    fireEvent.click(firstButton);

    await waitFor(() => expect((firstButton as HTMLButtonElement).disabled).toBe(true));
    expect(firstButton.getAttribute("aria-label")).toMatch(/testando gabinete/i);
    expect((secondButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(secondButton);
    await waitFor(() => expect((secondButton as HTMLButtonElement).disabled).toBe(true));
    expect((firstButton as HTMLButtonElement).disabled).toBe(true);

    resolveTest({ ...first, status: "connected" });
    await waitFor(() => expect((firstButton as HTMLButtonElement).disabled).toBe(false));
    expect((secondButton as HTMLButtonElement).disabled).toBe(true);
    resolveSecondTest({ ...second, status: "connected" });
    await waitFor(() => expect((secondButton as HTMLButtonElement).disabled).toBe(false));
  });

  it("confirms lifecycle changes and keeps their busy state scoped by ID", async () => {
    let resolveLifecycle!: (value: unknown) => void;
    mocks.apiRequest.mockImplementation((_method, url) => url.endsWith("/connection-1")
      ? new Promise(resolve => { resolveLifecycle = resolve; })
      : Promise.resolve({}));
    renderSettings([first, second]);

    fireEvent.click(await screen.findByTestId("button-toggle-connection-connection-1"));
    expect(mocks.apiRequest).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /confirmar desativação/i }));

    const firstToggle = screen.getByTestId("button-toggle-connection-connection-1");
    const secondToggle = screen.getByTestId("button-toggle-connection-connection-2");
    await waitFor(() => expect((firstToggle as HTMLButtonElement).disabled).toBe(true));
    expect((secondToggle as HTMLButtonElement).disabled).toBe(false);
    expect(mocks.apiRequest).toHaveBeenCalledWith("PATCH", "/api/attendance/connections/connection-1", { status: "disabled" });

    resolveLifecycle({ ...first, status: "disabled" });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("renders explicit loading, empty and forbidden states", async () => {
    let resolveConnections!: (value: Connection[]) => void;
    const pending = new Promise<Connection[]>(resolve => { resolveConnections = resolve; });
    const loading = renderSettings(pending);
    expect(screen.getByText(/carregando conexões/i)).toBeTruthy();
    resolveConnections([]);
    await screen.findByText(/nenhuma conexão configurada/i);
    loading.unmount();

    const forbiddenClient = new QueryClient({
      defaultOptions: { queries: { retry: false, queryFn: () => Promise.reject(new Error("Permission denied")) } },
    });
    render(<QueryClientProvider client={forbiddenClient}><SettingsTab /></QueryClientProvider>);
    expect(await screen.findByText(/sem permissão para gerenciar conexões/i)).toBeTruthy();
  });

  it("does not render credential fields from list data", async () => {
    renderSettings([{
      ...first,
      status: "error",
      lastError: "Não foi possível validar a conexão com o provedor.",
      token: "***",
      tokenFingerprint: "fingerprint-secret",
      metadata: { webhookSecret: "***" },
    }]);
    await screen.findByText("Gabinete");
    expect(screen.getByText("Não foi possível validar a conexão com o provedor.")).toBeTruthy();
    expect(screen.queryByText("fingerprint-secret")).toBeNull();
    expect(screen.queryByText("webhookSecret")).toBeNull();
  });
});
