// @vitest-environment jsdom
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AllianceLine } from "@shared/schema";
import { AllianceLineBadge } from "./AllianceLineBadge";
import { AllianceLineManager } from "./AllianceLineManager";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  invalidateQueries: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: mocks.apiRequest,
  queryClient: { invalidateQueries: mocks.invalidateQueries },
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

const firstLine: AllianceLine = {
  id: "11111111-1111-4111-8111-111111111111",
  accountId: "account-a",
  createdByUserId: "user-a",
  name: "Frente Popular",
  description: "Articulacao territorial",
  color: "#14B8A6",
  icon: "Users",
  displayOrder: 2,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const secondLine: AllianceLine = {
  ...firstLine,
  id: "22222222-2222-4222-8222-222222222222",
  name: "Pacto Democratico",
  color: "#1D4ED8",
  icon: "Flag",
  displayOrder: 1,
  active: false,
};

function renderManager(
  lines: AllianceLine[] = [firstLine, secondLine],
  options: { isLoading?: boolean; error?: Error | null } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    createElement(QueryClientProvider, { client: queryClient },
      createElement(AllianceLineManager, {
        open: true,
        onOpenChange: vi.fn(),
        lines,
        allianceCounts: new Map([[firstLine.id, 3], [secondLine.id, 1]]),
        isLoading: options.isLoading,
        error: options.error,
      }),
    ),
  );
}

beforeEach(() => {
  mocks.apiRequest.mockReset().mockResolvedValue({ json: async () => ({}) });
  mocks.invalidateQueries.mockReset();
  mocks.toast.mockReset();
});

afterEach(cleanup);

describe("AllianceLineBadge", () => {
  it("always renders the configured icon and name with a contrasting text color", () => {
    render(createElement(AllianceLineBadge, { line: firstLine }));

    expect(screen.getByText("Frente Popular")).toBeTruthy();
    expect(screen.getByTestId("alliance-line-icon-Users")).toBeTruthy();
    expect(screen.getByTestId("alliance-line-badge").style.color).toBe("rgb(0, 0, 0)");
  });

  it("uses an accessible fallback instead of resolving an arbitrary icon name", () => {
    render(createElement(AllianceLineBadge, {
      line: { ...firstLine, icon: "UntrustedIcon" as AllianceLine["icon"] },
    }));

    expect(screen.getByRole("img", { name: "Icone indisponivel" })).toBeTruthy();
  });
});

describe("AllianceLineManager", () => {
  it("lists active and inactive lines by display order with usage counts", () => {
    renderManager();

    const rows = screen.getAllByTestId("alliance-line-row");
    expect(rows[0].textContent).toContain("Pacto Democratico");
    expect(rows[0].textContent).toContain("Inativa");
    expect(rows[0].textContent).toContain("1 alianca");
    expect(rows[1].textContent).toContain("Frente Popular");
    expect(rows[1].textContent).toContain("3 aliancas");
  });

  it("creates a line from the synchronized hexadecimal color form and invalidates dependent data", async () => {
    const user = userEvent.setup();
    renderManager([]);

    await user.click(screen.getByRole("button", { name: "Nova linha" }));
    await user.type(screen.getByLabelText("Nome"), "Nova Frente");
    fireEvent.change(screen.getByLabelText("Cor hexadecimal"), { target: { value: "#123456" } });
    fireEvent.change(screen.getByLabelText("Ordem de exibicao"), { target: { value: "4" } });
    expect(screen.getByTestId("alliance-line-badge").style.backgroundColor).toBe("rgb(18, 52, 86)");
    await user.click(screen.getByRole("button", { name: "Salvar linha" }));

    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("POST", "/api/alliance-lines", {
      name: "Nova Frente",
      description: undefined,
      color: "#123456",
      icon: "Flag",
      displayOrder: 4,
      active: true,
    }));
    await waitFor(() => expect(mocks.invalidateQueries).toHaveBeenCalledTimes(2));
  });

  it("synchronizes the hexadecimal input after selecting a native color", async () => {
    const user = userEvent.setup();
    renderManager([]);

    await user.click(screen.getByRole("button", { name: "Nova linha" }));
    fireEvent.change(screen.getByLabelText("Seletor de cor"), { target: { value: "#abcdef" } });

    expect((screen.getByLabelText("Cor hexadecimal") as HTMLInputElement).value).toBe("#ABCDEF");
  });

  it("submits the full edited line through PATCH", async () => {
    const user = userEvent.setup();
    renderManager([firstLine]);

    await user.click(screen.getByRole("button", { name: "Editar Frente Popular" }));
    await user.clear(screen.getByLabelText("Nome"));
    await user.type(screen.getByLabelText("Nome"), "Frente Renovada");
    await user.clear(screen.getByLabelText("Descricao"));
    await user.type(screen.getByLabelText("Descricao"), "Nova articulacao");
    await user.click(screen.getByRole("button", { name: "Salvar linha" }));

    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("PATCH", `/api/alliance-lines/${firstLine.id}`, {
      name: "Frente Renovada",
      description: "Nova articulacao",
      color: "#14B8A6",
      icon: "Users",
      displayOrder: 2,
      active: true,
    }));
  });

  it("sends null when clearing an existing description", async () => {
    const user = userEvent.setup();
    renderManager([firstLine]);

    await user.click(screen.getByRole("button", { name: "Editar Frente Popular" }));
    await user.clear(screen.getByLabelText("Descricao"));
    await user.click(screen.getByRole("button", { name: "Salvar linha" }));

    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("PATCH", `/api/alliance-lines/${firstLine.id}`, expect.objectContaining({
      description: null,
    })));
  });

  it("sends every line id when moving a line upward", async () => {
    const user = userEvent.setup();
    renderManager();

    await user.click(screen.getByTestId(`button-move-line-up-${firstLine.id}`));

    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("PUT", "/api/alliance-lines/reorder", {
      ids: [firstLine.id, secondLine.id],
    }));
  });

  it("makes inactivation the direct action and recognizes the real in-use backend message", async () => {
    const user = userEvent.setup();
    mocks.apiRequest.mockImplementation((method: string) => {
      if (method === "DELETE") return Promise.reject(new Error("A linha politica possui aliancas vinculadas"));
      return Promise.resolve({ json: async () => ({}) });
    });
    renderManager([firstLine]);

    await user.click(screen.getByRole("button", { name: "Inativar" }));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("PATCH", `/api/alliance-lines/${firstLine.id}`, { active: false }));

    await user.click(screen.getByTestId(`button-delete-line-${firstLine.id}`));
    await user.click(screen.getByRole("button", { name: "Excluir linha" }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Linha em uso por aliancas",
      description: "Inative a linha para preservar o historico das aliancas vinculadas.",
    })));
  });

  it("shows loading, empty, and error states without rendering stale line rows", () => {
    const { unmount } = renderManager([], { isLoading: true });
    expect(screen.getByLabelText("Carregando linhas politicas")).toBeTruthy();
    expect(screen.queryAllByTestId("alliance-line-row")).toHaveLength(0);
    unmount();

    renderManager([]);
    expect(screen.getByText("Nenhuma linha politica cadastrada.")).toBeTruthy();
    cleanup();

    renderManager([], { error: new Error("Falha de rede") });
    expect(screen.getByText("Nao foi possivel carregar as linhas politicas. Tente novamente.")).toBeTruthy();
    expect(screen.queryAllByTestId("alliance-line-row")).toHaveLength(0);
  });

  it("marks the manager busy and disables actions while a mutation is pending", async () => {
    const user = userEvent.setup();
    let resolveUpdate: ((response: { json: () => Promise<Record<string, never>> }) => void) | undefined;
    mocks.apiRequest.mockImplementation((method: string) => {
      if (method === "PATCH") return new Promise((resolve) => { resolveUpdate = resolve; });
      return Promise.resolve({ json: async () => ({}) });
    });
    renderManager([firstLine]);

    await user.click(screen.getByRole("button", { name: "Inativar" }));

    await waitFor(() => expect(screen.getByTestId("alliance-line-manager").getAttribute("aria-busy")).toBe("true"));
    expect(screen.getByRole("button", { name: "Inativar" })).toBeInstanceOf(HTMLButtonElement);
    expect((screen.getByRole("button", { name: "Inativar" }) as HTMLButtonElement).disabled).toBe(true);

    resolveUpdate?.({ json: async () => ({}) });
    await waitFor(() => expect(screen.getByTestId("alliance-line-manager").getAttribute("aria-busy")).toBe("false"));
  });
});
