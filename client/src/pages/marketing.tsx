import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  type GoogleAdsCampaign,
  type InsertGoogleAdsCampaign,
  type GoogleAdsCampaignAsset,
  insertGoogleAdsCampaignSchema
} from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, Edit, X, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";

const GOOGLE_ADS_STATUS_CONFIG = {
  submitted: { label: "Enviado", color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" },
  under_review: { label: "Em Análise", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  approved: { label: "Aprovado", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  rejected: { label: "Rejeitado", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  scheduled: { label: "Agendado", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  running: { label: "Em Execução", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200" },
  paused: { label: "Pausado", color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" },
  completed: { label: "Concluído", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
};

const OBJECTIVE_LABELS = {
  gerar_novo_eleitor: "Gerar Novo Eleitor",
  pesquisa_satisfacao: "Pesquisa de Satisfação",
  pesquisa_social: "Pesquisa Social",
};

const TARGET_SCOPE_LABELS = {
  bairro: "Bairro(s)",
  cidade: "Cidade(s)",
  estado: "Estado",
  brasil: "Brasil",
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function calculateManagementFee(budget: number): number {
  return budget * 0.15;
}

function calculateTotalCost(budget: number): number {
  return budget * 1.15;
}


interface ImageUploadProps {
  campaignId: string;
  onUploadComplete: () => void;
}

function ImageUploadComponent({ campaignId, onUploadComplete }: ImageUploadProps) {
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [assetToDelete, setAssetToDelete] = useState<string | null>(null);
  const { toast } = useToast();
  const fileInputId = `file-input-${campaignId}`;

  const { data: assets, isLoading: assetsLoading } = useQuery<GoogleAdsCampaignAsset[]>({
    queryKey: ["/api/google-ads-campaigns", campaignId, "assets"],
    enabled: !!campaignId,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!file.type.startsWith("image/")) {
        throw new Error("Apenas imagens são permitidas.");
      }

      const reader = new FileReader();
      return new Promise((resolve, reject) => {
        reader.onload = async () => {
          try {
            const imageData = reader.result as string;
            const response = await apiRequest("POST", `/api/google-ads-campaigns/${campaignId}/upload-image`, {
              imageData,
              filename: file.name,
              mimeType: file.type,
            });
            resolve(response);
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/google-ads-campaigns", campaignId, "assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/google-ads-campaigns"] });
      toast({ title: "Imagem enviada com sucesso!" });
      onUploadComplete();
    },
    onError: (error: Error) => {
      toast({ title: error.message || "Erro ao enviar imagem", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (assetId: string) => apiRequest("DELETE", `/api/google-ads-campaign-assets/${assetId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/google-ads-campaigns", campaignId, "assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/google-ads-campaigns"] });
    },
    onError: () => {
      toast({ title: "Erro ao remover imagem", variant: "destructive" });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => uploadMutation.mutate(file));
  };

  const handleDeleteClick = (assetId: string) => {
    setAssetToDelete(assetId);
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (assetToDelete) {
      await deleteMutation.mutateAsync(assetToDelete);
      toast({ title: "Imagem removida com sucesso!" });
    }
    setShowDeleteDialog(false);
    setAssetToDelete(null);
  };

  const handleToggleSelect = (assetId: string) => {
    setSelectedAssets(prev => 
      prev.includes(assetId) 
        ? prev.filter(id => id !== assetId)
        : [...prev, assetId]
    );
  };

  const handleSelectAll = () => {
    if (selectedAssets.length === assets?.length) {
      setSelectedAssets([]);
    } else {
      setSelectedAssets(assets?.map(a => a.id) || []);
    }
  };

  const handleDeleteSelected = async () => {
    const count = selectedAssets.length;
    try {
      for (const assetId of selectedAssets) {
        await deleteMutation.mutateAsync(assetId);
      }
      toast({ title: `${count} imagem(ns) removida(s) com sucesso!` });
    } catch (error) {
      toast({ title: "Erro ao remover imagens", variant: "destructive" });
    }
    setSelectedAssets([]);
    setShowDeleteDialog(false);
  };

  const currentCount = assets?.length || 0;
  const hasSelection = selectedAssets.length > 0;
  const allSelected = selectedAssets.length === currentCount && currentCount > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Label>Imagens da Campanha ({currentCount})</Label>
        <div className="flex gap-2">
          {currentCount > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={handleSelectAll}
              data-testid="button-select-all"
            >
              {allSelected ? "Desmarcar Todas" : "Selecionar Todas"}
            </Button>
          )}
          {hasSelection && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="rounded-full"
              onClick={() => setShowDeleteDialog(true)}
              disabled={deleteMutation.isPending}
              data-testid="button-delete-selected"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Excluir Selecionadas ({selectedAssets.length})
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => document.getElementById(fileInputId)?.click()}
            disabled={uploadMutation.isPending}
            data-testid="button-upload-image"
          >
            <ImageIcon className="w-4 h-4 mr-2" />
            {uploadMutation.isPending ? "Enviando..." : "Adicionar Imagem"}
          </Button>
        </div>
        <input
          id={fileInputId}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          data-testid="input-file-upload"
        />
      </div>

      {assetsLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {assets?.map((asset) => (
            <div key={asset.id} className="relative group">
              <div className="absolute top-2 left-2 z-10">
                <Checkbox
                  checked={selectedAssets.includes(asset.id)}
                  onCheckedChange={() => handleToggleSelect(asset.id)}
                  className="bg-white dark:bg-gray-800"
                  data-testid={`checkbox-select-image-${asset.id}`}
                />
              </div>
              <img
                src={asset.url}
                alt={asset.originalFilename}
                className="w-full aspect-square object-cover rounded-lg"
              />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-full"
                onClick={() => handleDeleteClick(asset.id)}
                disabled={deleteMutation.isPending}
                data-testid={`button-delete-image-${asset.id}`}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {currentCount === 0 && !assetsLoading && (
        <div className="text-center py-8 text-muted-foreground">
          <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>Nenhuma imagem adicionada ainda</p>
        </div>
      )}

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              {assetToDelete 
                ? "Tem certeza que deseja excluir esta imagem? Esta ação não pode ser desfeita."
                : `Tem certeza que deseja excluir ${selectedAssets.length} imagem(ns)? Esta ação não pode ser desfeita.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full" disabled={deleteMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={assetToDelete ? handleConfirmDelete : handleDeleteSelected}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


function GoogleAdsTab() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<GoogleAdsCampaign | null>(null);
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const { toast } = useToast();

  const { data: campaigns, isLoading } = useQuery<(GoogleAdsCampaign & { assets?: GoogleAdsCampaignAsset[] })[]>({
    queryKey: ["/api/google-ads-campaigns"],
  });

  const form = useForm<InsertGoogleAdsCampaign>({
    resolver: zodResolver(insertGoogleAdsCampaignSchema),
    defaultValues: {
      campaignName: "",
      objective: "gerar_novo_eleitor",
      targetScope: "brasil",
      targetLocations: [],
      budget: "0",
      managementFee: "0",
      durationDays: 7,
      lpSlug: "",
      lpUrl: "",
      status: "under_review",
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
  });

  const campaignName = form.watch("campaignName");
  const budget = form.watch("budget");
  const targetScope = form.watch("targetScope");
  const durationDays = form.watch("durationDays");

  useEffect(() => {
    if (campaignName) {
      const slug = slugify(campaignName);
      form.setValue("lpSlug", slug);
      form.setValue("lpUrl", `https://www.politicall.com.br/${slug}`);
    }
  }, [campaignName, form]);

  useEffect(() => {
    const budgetNum = parseFloat(budget) || 0;
    const fee = calculateManagementFee(budgetNum);
    form.setValue("managementFee", fee.toFixed(2));
  }, [budget, form]);

  useEffect(() => {
    if (durationDays) {
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + durationDays);
      
      form.setValue("startDate", startDate.toISOString());
      form.setValue("endDate", endDate.toISOString());
    }
  }, [durationDays, form]);

  const createMutation = useMutation({
    mutationFn: (data: InsertGoogleAdsCampaign) => apiRequest("POST", "/api/google-ads-campaigns", data),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/google-ads-campaigns"] });
      toast({ title: "Campanha criada com sucesso!" });
      setIsDialogOpen(false);
      setSelectedCampaignId(data.id);
      setShowImageUpload(true);
      form.reset();
    },
    onError: () => {
      toast({ title: "Erro ao criar campanha", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertGoogleAdsCampaign> }) =>
      apiRequest("PATCH", `/api/google-ads-campaigns/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/google-ads-campaigns"] });
      toast({ title: "Campanha atualizada com sucesso!" });
      setIsDialogOpen(false);
      setEditingCampaign(null);
      form.reset();
    },
    onError: () => {
      toast({ title: "Erro ao atualizar campanha", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/google-ads-campaigns/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/google-ads-campaigns"] });
      toast({ title: "Campanha excluída com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao excluir campanha", variant: "destructive" });
    },
  });

  const handleSubmit = (data: InsertGoogleAdsCampaign) => {
    if (editingCampaign) {
      updateMutation.mutate({ id: editingCampaign.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (campaign: GoogleAdsCampaign) => {
    setEditingCampaign(campaign);
    form.reset({
      campaignName: campaign.campaignName,
      objective: campaign.objective as "gerar_novo_eleitor" | "pesquisa_satisfacao" | "pesquisa_social",
      targetScope: campaign.targetScope as "bairro" | "cidade" | "estado" | "brasil",
      targetLocations: campaign.targetLocations as string[] || [],
      budget: campaign.budget,
      managementFee: campaign.managementFee,
      durationDays: campaign.durationDays,
      lpSlug: campaign.lpSlug,
      lpUrl: campaign.lpUrl,
      status: campaign.status,
      startDate: campaign.startDate as any,
      endDate: campaign.endDate as any,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Tem certeza que deseja excluir esta campanha?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleAddImages = (campaignId: string) => {
    setSelectedCampaignId(campaignId);
    setShowImageUpload(true);
  };

  const budgetNum = parseFloat(budget) || 0;
  const managementFee = calculateManagementFee(budgetNum);
  const totalCost = calculateTotalCost(budgetNum);

  const needsLocationInput = targetScope !== "brasil";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">Gerencie suas campanhas do Google Ads</p>
        <Button 
          onClick={() => {
            setEditingCampaign(null);
            form.reset();
            setIsDialogOpen(true);
          }}
          className="rounded-full"
          data-testid="button-new-google-ads-campaign"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nova Campanha Google Ads
        </Button>

        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setEditingCampaign(null);
            form.reset();
          }
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b">
              <DialogTitle>{editingCampaign ? "Editar Campanha" : "Nova Campanha Google Ads"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col flex-1 overflow-hidden">
                <div className="overflow-y-auto px-6 py-4 space-y-4">
                  <FormField
                    control={form.control}
                    name="campaignName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome da Campanha *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Ex: Campanha Eleitoral 2025" 
                            data-testid="input-google-campaign-name" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="p-4 bg-muted rounded-lg">
                    <Label className="text-sm">URL da Landing Page</Label>
                    <p className="text-sm font-mono mt-1" data-testid="text-lp-url">
                      {form.watch("lpUrl") || "https://www.politicall.com.br/..."}
                    </p>
                  </div>

                  <FormField
                    control={form.control}
                    name="objective"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Objetivo *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-objective">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="gerar_novo_eleitor">Gerar Novo Eleitor</SelectItem>
                            <SelectItem value="pesquisa_satisfacao">Pesquisa de Satisfação</SelectItem>
                            <SelectItem value="pesquisa_social">Pesquisa Social</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="targetScope"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Localização Alvo *</FormLabel>
                        <RadioGroup
                          value={field.value}
                          onValueChange={field.onChange}
                          className="flex flex-wrap gap-4"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="bairro" id="bairro" data-testid="radio-target-bairro" />
                            <Label htmlFor="bairro">Bairro(s)</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="cidade" id="cidade" data-testid="radio-target-cidade" />
                            <Label htmlFor="cidade">Cidade(s)</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="estado" id="estado" data-testid="radio-target-estado" />
                            <Label htmlFor="estado">Estado</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="brasil" id="brasil" data-testid="radio-target-brasil" />
                            <Label htmlFor="brasil">Brasil</Label>
                          </div>
                        </RadioGroup>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {needsLocationInput && (
                    <FormField
                      control={form.control}
                      name="targetLocations"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {targetScope === "bairro" ? "Nome dos Bairros" : 
                             targetScope === "cidade" ? "Nome das Cidades" : "Nome do Estado"}
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Separe por vírgula. Ex: Centro, Jardins, Vila Nova"
                              data-testid="input-target-locations"
                              value={field.value?.join(", ") || ""}
                              onChange={(e) => {
                                const locations = e.target.value
                                  .split(",")
                                  .map(l => l.trim())
                                  .filter(l => l);
                                field.onChange(locations);
                              }}
                            />
                          </FormControl>
                          <FormDescription>
                            Digite os nomes separados por vírgula
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={form.control}
                    name="budget"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Orçamento (R$) *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="1000.00"
                            data-testid="input-budget"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="p-4 bg-muted rounded-lg space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Orçamento Base:</span>
                      <span data-testid="text-base-budget">R$ {budgetNum.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Taxa de Gerenciamento (15%):</span>
                      <span data-testid="text-management-fee">R$ {managementFee.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-semibold border-t pt-2">
                      <span>Custo Total:</span>
                      <span data-testid="text-total-cost">R$ {totalCost.toFixed(2)}</span>
                    </div>
                  </div>

                  <FormField
                    control={form.control}
                    name="durationDays"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Duração (dias) *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="7"
                            max="30"
                            placeholder="7"
                            data-testid="input-duration"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                          />
                        </FormControl>
                        <FormDescription>
                          Mínimo 7 dias, máximo 30 dias
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <DialogFooter className="px-6 py-4 border-t">
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="rounded-full w-full"
                    data-testid="button-submit-google-campaign"
                  >
                    {createMutation.isPending || updateMutation.isPending
                      ? "Salvando..."
                      : editingCampaign
                      ? "Atualizar Campanha"
                      : "Criar Campanha"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <Dialog open={showImageUpload} onOpenChange={setShowImageUpload}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b">
              <DialogTitle>Adicionar Imagens</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto px-6 py-4">
              <ImageUploadComponent
                campaignId={selectedCampaignId}
                onUploadComplete={() => {}}
              />
            </div>
            <DialogFooter className="px-6 py-4 border-t">
              <Button
                onClick={() => setShowImageUpload(false)}
                className="rounded-full w-full"
                data-testid="button-close-image-upload"
              >
                Concluir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : campaigns && campaigns.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => {
            const canEdit = campaign.status === "under_review" || campaign.status === "rejected";
            const assetCount = campaign.assets?.length || 0;
            const displayAssets = campaign.assets?.slice(0, 3) || [];

            return (
              <Card key={campaign.id} data-testid={`card-google-campaign-${campaign.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg">{campaign.campaignName}</CardTitle>
                    <Badge className={GOOGLE_ADS_STATUS_CONFIG[campaign.status as keyof typeof GOOGLE_ADS_STATUS_CONFIG]?.color}>
                      {GOOGLE_ADS_STATUS_CONFIG[campaign.status as keyof typeof GOOGLE_ADS_STATUS_CONFIG]?.label || campaign.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Badge variant="outline" className="mb-2">
                      {OBJECTIVE_LABELS[campaign.objective as keyof typeof OBJECTIVE_LABELS]}
                    </Badge>
                  </div>
                  
                  <div className="text-sm">
                    <span className="text-muted-foreground">Localização: </span>
                    <span>
                      {campaign.targetScope === "brasil" 
                        ? "Todo o Brasil" 
                        : `${TARGET_SCOPE_LABELS[campaign.targetScope as keyof typeof TARGET_SCOPE_LABELS]}: ${(campaign.targetLocations as string[] || []).join(", ")}`}
                    </span>
                  </div>

                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Orçamento:</span>
                      <span>R$ {parseFloat(campaign.budget).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Taxa (15%):</span>
                      <span>R$ {parseFloat(campaign.managementFee).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <span>Total:</span>
                      <span data-testid={`text-campaign-total-${campaign.id}`}>
                        R$ {(parseFloat(campaign.budget) + parseFloat(campaign.managementFee)).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    Duração: {campaign.durationDays} dias
                  </div>

                  {displayAssets.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">
                        Imagens ({assetCount})
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {displayAssets.map((asset) => (
                          <img
                            key={asset.id}
                            src={asset.url}
                            alt={asset.originalFilename}
                            className="w-full aspect-square object-cover rounded"
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground">
                    <a 
                      href={campaign.lpUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                      data-testid={`link-lp-${campaign.id}`}
                    >
                      {campaign.lpUrl}
                    </a>
                  </div>
                </CardContent>
                <CardFooter className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full flex-1"
                    onClick={() => handleAddImages(campaign.id)}
                    data-testid={`button-add-images-${campaign.id}`}
                  >
                    <ImageIcon className="w-4 h-4 mr-2" />
                    Imagens
                  </Button>
                  {canEdit && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={() => handleEdit(campaign)}
                        data-testid={`button-edit-${campaign.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="rounded-full"
                        onClick={() => handleDelete(campaign.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-${campaign.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Nenhuma campanha Google Ads criada ainda</p>
        </div>
      )}
    </div>
  );
}

export default function Marketing() {
  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Marketing</h1>
        <p className="text-muted-foreground mt-2">Gerencie suas campanhas do Google Ads</p>
      </div>

      <GoogleAdsTab />
    </div>
  );
}
