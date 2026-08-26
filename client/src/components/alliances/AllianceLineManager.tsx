import { useMemo, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Edit, Loader2, Plus, Power, Trash2 } from "lucide-react";
import type { AllianceLine } from "@shared/schema";
import { ALLIANCE_LINE_ICONS } from "@shared/alliance-lines";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AllianceLineBadge } from "./AllianceLineBadge";

type AllianceLineDraft = {
  name: string;
  description: string;
  color: string;
  icon: string;
  displayOrder: number;
  active: boolean;
};

type AllianceLineUpdate = Omit<Partial<AllianceLineDraft>, "description"> & { description?: string | null };

type AllianceLineManagerProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  lines?: AllianceLine[];
  allianceCounts: ReadonlyMap<string, number>;
  isLoading?: boolean;
  error?: Error | null;
};

const defaultDraft = (displayOrder: number): AllianceLineDraft => ({
  name: "",
  description: "",
  color: "#2563EB",
  icon: "Flag",
  displayOrder,
  active: true,
});

const allianceLineInUseMessage = "A linha politica possui aliancas vinculadas";

function sortLines(lines: AllianceLine[]) {
  return [...lines].sort((left, right) => left.displayOrder - right.displayOrder || left.name.localeCompare(right.name, "pt-BR"));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "";
}

function isAllianceLineInUseError(error: unknown) {
  return getErrorMessage(error) === allianceLineInUseMessage;
}

export function AllianceLineManager({
  open,
  onOpenChange,
  lines = [],
  allianceCounts,
  isLoading = false,
  error = null,
}: AllianceLineManagerProps) {
  const { toast } = useToast();
  const sortedLines = useMemo(() => sortLines(lines), [lines]);
  const [draft, setDraft] = useState<AllianceLineDraft>(() => defaultDraft(lines.length));
  const [editingLine, setEditingLine] = useState<AllianceLine | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<AllianceLine | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const invalidateRelated = () => {
    void queryClient.invalidateQueries({
      predicate: (query) => String(query.queryKey[0] ?? "").startsWith("/api/alliance-lines"),
    });
    void queryClient.invalidateQueries({ queryKey: ["/api/alliances"] });
  };

  const createMutation = useMutation({
    mutationFn: async (data: Omit<AllianceLineDraft, "description"> & { description?: string }) => {
      const response = await apiRequest("POST", "/api/alliance-lines", data);
      return response.json();
    },
    onSuccess: () => {
      invalidateRelated();
      toast({ title: "Linha politica criada" });
      setFormOpen(false);
    },
    onError: () => toast({ title: "Erro ao criar linha politica", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: AllianceLineUpdate }) => {
      const response = await apiRequest("PATCH", `/api/alliance-lines/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      invalidateRelated();
      toast({ title: "Linha politica atualizada" });
      setFormOpen(false);
    },
    onError: () => toast({ title: "Erro ao atualizar linha politica", variant: "destructive" }),
  });

  const reorderMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await apiRequest("PUT", "/api/alliance-lines/reorder", { ids });
      return response.json();
    },
    onSuccess: () => {
      invalidateRelated();
      toast({ title: "Ordem das linhas atualizada" });
    },
    onError: () => toast({ title: "Erro ao reordenar linhas", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/alliance-lines/${id}`);
      return response.json();
    },
    onSuccess: () => {
      invalidateRelated();
      toast({ title: "Linha politica excluida" });
      setDeleteCandidate(null);
    },
    onError: (mutationError) => {
      setDeleteCandidate(null);
      if (isAllianceLineInUseError(mutationError)) {
        toast({
          title: "Linha em uso por aliancas",
          description: "Inative a linha para preservar o historico das aliancas vinculadas.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Erro ao excluir linha politica", variant: "destructive" });
    },
  });

  const isBusy = createMutation.isPending || updateMutation.isPending || reorderMutation.isPending || deleteMutation.isPending;

  const openCreateForm = () => {
    setEditingLine(null);
    setDraft(defaultDraft(sortedLines.length));
    setFormError(null);
    setFormOpen(true);
  };

  const openEditForm = (line: AllianceLine) => {
    setEditingLine(line);
    setDraft({
      name: line.name,
      description: line.description ?? "",
      color: line.color,
      icon: line.icon,
      displayOrder: line.displayOrder,
      active: line.active,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const saveLine = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = draft.name.trim();
    const description = draft.description.trim();
    if (name.length < 2) {
      setFormError("Informe um nome com ao menos 2 caracteres.");
      return;
    }
    if (!/^#[0-9A-Fa-f]{6}$/.test(draft.color)) {
      setFormError("Informe uma cor hexadecimal valida.");
      return;
    }
    if (!ALLIANCE_LINE_ICONS.includes(draft.icon as typeof ALLIANCE_LINE_ICONS[number])) {
      setFormError("Selecione um icone permitido.");
      return;
    }
    if (!Number.isInteger(draft.displayOrder) || draft.displayOrder < 0) {
      setFormError("A ordem de exibicao deve ser um numero inteiro maior ou igual a zero.");
      return;
    }

    if (editingLine) {
      updateMutation.mutate({ id: editingLine.id, data: { ...draft, name, description: description || null } });
    } else {
      createMutation.mutate({ ...draft, name, description: description || undefined });
    }
  };

  const moveLine = (lineId: string, direction: -1 | 1) => {
    const currentIndex = sortedLines.findIndex((line) => line.id === lineId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= sortedLines.length) return;
    const reordered = [...sortedLines];
    [reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[currentIndex]];
    reorderMutation.mutate(reordered.map((line) => line.id));
  };

  const setLineActive = (line: AllianceLine, active: boolean) => {
    updateMutation.mutate({ id: line.id, data: { active } });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-busy={isBusy} className="max-h-[90vh] max-w-3xl overflow-y-auto" data-testid="alliance-line-manager">
        <DialogHeader>
          <DialogTitle>Linhas politicas</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">{sortedLines.length} linhas cadastradas</span>
          <Button disabled={isBusy} onClick={openCreateForm} type="button">
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Nova linha
          </Button>
        </div>

        {isLoading && (
          <div className="space-y-3" aria-label="Carregando linhas politicas">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>Nao foi possivel carregar as linhas politicas. Tente novamente.</AlertDescription>
          </Alert>
        )}

        {!isLoading && !error && sortedLines.length === 0 && (
          <div className="border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhuma linha politica cadastrada.
          </div>
        )}

        {!isLoading && !error && sortedLines.length > 0 && (
          <TooltipProvider>
            <div className="space-y-3">
              {sortedLines.map((line, index) => {
                const allianceCount = allianceCounts.get(line.id) ?? 0;
                return (
                  <div className="flex flex-col gap-3 border p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="alliance-line-row" key={line.id}>
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span aria-label={`Cor ${line.color}`} className="h-4 w-4 shrink-0 rounded-sm border" style={{ backgroundColor: line.color }} />
                        <AllianceLineBadge line={line} />
                        <Badge variant={line.active ? "default" : "secondary"}>{line.active ? "Ativa" : "Inativa"}</Badge>
                      </div>
                      {line.description && <p className="text-sm text-muted-foreground">{line.description}</p>}
                      <p className="text-xs text-muted-foreground">
                        {allianceCount} {allianceCount === 1 ? "alianca" : "aliancas"} | Ordem {line.displayOrder}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button disabled={isBusy} onClick={() => setLineActive(line, !line.active)} size="sm" type="button" variant="outline">
                        <Power className="mr-2 h-4 w-4" aria-hidden="true" />
                        {line.active ? "Inativar" : "Reativar"}
                      </Button>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button aria-label={`Mover ${line.name} para cima`} data-testid={`button-move-line-up-${line.id}`} disabled={isBusy || index === 0} onClick={() => moveLine(line.id, -1)} size="icon" type="button" variant="outline">
                            <ArrowUp className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Mover acima</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button aria-label={`Mover ${line.name} para baixo`} data-testid={`button-move-line-down-${line.id}`} disabled={isBusy || index === sortedLines.length - 1} onClick={() => moveLine(line.id, 1)} size="icon" type="button" variant="outline">
                            <ArrowDown className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Mover abaixo</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button aria-label={`Editar ${line.name}`} disabled={isBusy} onClick={() => openEditForm(line)} size="icon" type="button" variant="outline">
                            <Edit className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Editar linha</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button aria-label={`Excluir ${line.name}`} data-testid={`button-delete-line-${line.id}`} disabled={isBusy} onClick={() => setDeleteCandidate(line)} size="icon" type="button" variant="destructive">
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Excluir linha</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                );
              })}
            </div>
          </TooltipProvider>
        )}

        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingLine ? "Editar linha politica" : "Nova linha politica"}</DialogTitle>
            </DialogHeader>
            <form className="space-y-4" onSubmit={saveLine}>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="alliance-line-name">Nome</label>
                <Input id="alliance-line-name" onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} required value={draft.name} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="alliance-line-description">Descricao</label>
                <Textarea id="alliance-line-description" onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} value={draft.description} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="alliance-line-color-picker">Cor</label>
                  <Input aria-label="Seletor de cor" id="alliance-line-color-picker" onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value.toUpperCase() }))} type="color" value={draft.color} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="alliance-line-color-hex">Cor hexadecimal</label>
                  <Input aria-invalid={!/^#[0-9A-Fa-f]{6}$/.test(draft.color)} id="alliance-line-color-hex" onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value.toUpperCase() }))} value={draft.color} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="alliance-line-icon">Icone</label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" id="alliance-line-icon" onChange={(event) => setDraft((current) => ({ ...current, icon: event.target.value }))} value={draft.icon}>
                    {ALLIANCE_LINE_ICONS.map((icon) => <option key={icon} value={icon}>{icon}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="alliance-line-order">Ordem de exibicao</label>
                  <Input id="alliance-line-order" min={0} onChange={(event) => setDraft((current) => ({ ...current, displayOrder: Number(event.target.value) }))} required type="number" value={draft.displayOrder} />
                </div>
              </div>
              <div className="flex items-center justify-between border p-3">
                <label className="text-sm font-medium" htmlFor="alliance-line-active">Linha ativa</label>
                <Switch checked={draft.active} id="alliance-line-active" onCheckedChange={(active) => setDraft((current) => ({ ...current, active }))} />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Previa</p>
                <div data-testid="alliance-line-preview"><AllianceLineBadge line={{ name: draft.name || "Nome da linha", color: draft.color, icon: draft.icon }} /></div>
              </div>
              {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}
              <div className="flex justify-end gap-2">
                <Button disabled={isBusy} onClick={() => setFormOpen(false)} type="button" variant="outline">Cancelar</Button>
                <Button disabled={isBusy} type="submit">
                  {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                  Salvar linha
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteCandidate !== null} onOpenChange={(nextOpen) => !nextOpen && setDeleteCandidate(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir linha politica?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acao e definitiva. Prefira inativar linhas que ja possuem historico de aliancas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isBusy}>Cancelar</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={isBusy} onClick={() => deleteCandidate && deleteMutation.mutate(deleteCandidate.id)}>
                Excluir linha
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
