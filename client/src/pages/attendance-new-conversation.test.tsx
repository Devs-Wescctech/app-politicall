// @vitest-environment jsdom
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewConversationDialog } from "./attendance";

Object.assign(HTMLElement.prototype, {
  hasPointerCapture: () => false,
  setPointerCapture: () => undefined,
  releasePointerCapture: () => undefined,
  scrollIntoView: () => undefined,
});

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  invalidateQueries: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: mocks.apiRequest,
  queryClient: { invalidateQueries: mocks.invalidateQueries },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/hooks/use-attendance-realtime", () => ({ useAttendanceRealtime: () => ({ mode: "connected", reconnectNow: vi.fn() }) }));

const connected = {
  id: "connection-ready",
  accountId: "account-1",
  name: "Gabinete Centro",
  channel: "whatsapp",
  provider: "wescctech",
  status: "connected",
  token: "***",
  metadata: { phoneNumber: "5551999990001" },
};

function createClient(connections = [connected]) {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: ({ queryKey }) => {
          if (queryKey[0] === "/api/attendance/connections/available") return connections;
          if (queryKey[0] === "/api/attendance/sectors") return [];
          return [];
        },
      },
      mutations: { retry: false },
    },
  });
}

function dialogTree(client: QueryClient, open = true) {
  return createElement(QueryClientProvider, { client }, createElement(NewConversationDialog, { open, onClose: vi.fn() }));
}

function renderDialog(connections = [connected]) {
  const client = createClient(connections);
  return { client, ...render(dialogTree(client)) };
}

beforeEach(() => {
  mocks.apiRequest.mockReset().mockResolvedValue({ json: async () => ({}) });
  mocks.invalidateQueries.mockReset();
  mocks.toast.mockReset();
});
afterEach(cleanup);

describe("NewConversationDialog sender selection", () => {
  it("starts unselected, hides unhealthy senders, and requires a connected sender before submit", async () => {
    renderDialog([connected, { ...connected, id: "connection-disabled", name: "Indisponivel", status: "disabled" }]);
    await waitFor(() => expect(screen.getByTestId("select-new-conv-channel")).toBeTruthy());

    expect(screen.getByRole("alert").textContent).toContain("Selecione um número conectado");
    expect((screen.getByTestId("button-confirm-new-conversation") as HTMLButtonElement).disabled).toBe(true);
    await userEvent.setup().click(screen.getByTestId("select-new-conv-channel"));
    expect(await screen.findByRole("option", { name: /Gabinete Centro/ })).toBeTruthy();
    expect(screen.queryByText("Indisponivel")).toBeNull();
  });

  it("submits the exact selected sender and resets it when reopened", async () => {
    const user = userEvent.setup();
    const view = renderDialog();
    await waitFor(() => expect(screen.getByTestId("select-new-conv-channel")).toBeTruthy());
    await user.type(screen.getByTestId("input-new-conv-phone"), "51999990000");
    await user.click(screen.getByTestId("select-new-conv-channel"));
    await user.click(await screen.findByRole("option", { name: /Gabinete Centro/ }));
    await user.click(screen.getByTestId("button-confirm-new-conversation"));

    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("POST", "/api/attendance/conversations/create-new", expect.objectContaining({
      connectionId: "connection-ready",
    })));

    view.rerender(dialogTree(view.client, false));
    view.rerender(dialogTree(view.client, true));
    await waitFor(() => expect((screen.getByTestId("button-confirm-new-conversation") as HTMLButtonElement).disabled).toBe(true));
  });
});
