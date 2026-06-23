import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  insertPetitionSchema,
  insertPetitionCampaignSchema,
  insertPetitionMessageTemplateSchema,
  insertLinkBioPageSchema,
  insertLinkTreePageSchema,
  type Petition,
  type PetitionSignature,
  type PetitionCampaign,
  type PetitionCampaignLog,
  type PetitionMessageTemplate,
  type LinkBioPage,
  type LinkTreePage,
  type LinkTreeLink,
  type InsertPetition,
  type InsertPetitionCampaign,
  type InsertPetitionMessageTemplate,
  type InsertLinkBioPage,
  type InsertLinkTreePage,
} from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Plus,
  Pencil,
  Trash2,
  Copy,
  Eye,
  Download,
  QrCode,
  FileText,
  ScrollText,
  Users,
  Activity,
  MessageSquare,
  Mail,
  Link as LinkIcon,
  ListTree,
  Loader2,
  X,
  Image as ImageIcon,
  Upload,
  Send,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getAuthToken } from "@/lib/auth";

// ============================================================================
// Helpers
// ============================================================================

interface PetitionWithCount extends Petition {
  signaturesCount?: number;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("image", file);
  const res = await fetch("/api/petitions/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${getAuthToken()}` },
    body: fd,
  });
  if (!res.ok) {
    throw new Error("Falha no upload da imagem");
  }
  const data = await res.json();
  return data.url as string;
}

async function downloadAuthedFile(url: string, filename: string): Promise<void> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${getAuthToken()}` },
  });
  if (!res.ok) {
    throw new Error("Falha ao baixar arquivo");
  }
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objUrl);
}

const PETITION_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  rascunho: { label: "Rascunho", variant: "secondary" },
  publicada: { label: "Publicada", variant: "default" },
  pausada: { label: "Pausada", variant: "outline" },
  concluida: { label: "Concluída", variant: "destructive" },
};

const CAMPAIGN_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  rascunho: { label: "Rascunho", variant: "secondary" },
  agendada: { label: "Agendada", variant: "outline" },
  enviando: { label: "Enviando", variant: "default" },
  concluida: { label: "Concluída", variant: "default" },
  pausada: { label: "Pausada", variant: "outline" },
};

function copyToClipboard(text: string, toast: ReturnType<typeof useToast>["toast"]) {
  navigator.clipboard
    .writeText(text)
    .then(() => toast({ title: "Link copiado!", description: text }))
    .catch(() => toast({ title: "Erro ao copiar link", variant: "destructive" }));
}

// ============================================================================
// Image upload field
// ============================================================================

function ImageUploadField({
  value,
  onChange,
  label,
  testid,
}: {
  value?: string | null;
  onChange: (url: string) => void;
  label: string;
  testid: string;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      onChange(url);
      toast({ title: "Imagem enviada com sucesso!" });
    } catch {
      toast({ title: "Erro ao enviar imagem", variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <FormLabel>{label}</FormLabel>
      <div className="flex flex-wrap items-center gap-3">
        {value ? (
          <div className="flex items-center gap-2">
            <img
              src={value}
              alt={label}
              className="h-12 w-12 rounded-md object-cover"
              data-testid={`img-${testid}`}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onChange("")}
              data-testid={`button-remove-${testid}`}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <ImageIcon className="h-5 w-5" />
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
          data-testid={`input-${testid}`}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          data-testid={`button-upload-${testid}`}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {uploading ? "Enviando..." : "Enviar imagem"}
        </Button>
      </div>
    </div>
  );
}

function SwitchField({
  control,
  name,
  label,
  testid,
}: {
  control: any;
  name: string;
  label: string;
  testid: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex items-center justify-between gap-2 rounded-md border p-3 space-y-0">
          <FormLabel className="cursor-pointer">{label}</FormLabel>
          <FormControl>
            <Switch
              checked={!!field.value}
              onCheckedChange={field.onChange}
              data-testid={`switch-${testid}`}
            />
          </FormControl>
        </FormItem>
      )}
    />
  );
}

// ============================================================================
// Petition form dialog
// ============================================================================

const petitionDefaults: InsertPetition = {
  title: "",
  slug: "",
  description: "",
  goal: 100,
  status: "rascunho",
  primaryColor: "#6366f1",
  shareText: "",
  videoUrl: "",
  bannerUrl: "",
  logoUrl: "",
  collectPhone: false,
  collectCity: true,
  collectState: false,
  collectCpf: false,
  collectEmail: false,
  collectComment: true,
  requireEmail: false,
  requirePhone: false,
  requireLocation: false,
  requireCpf: false,
  requireComment: false,
  lgpdText: "",
};

function PetitionFormDialog({
  open,
  onOpenChange,
  petition,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  petition?: PetitionWithCount | null;
}) {
  const { toast } = useToast();
  const isEdit = !!petition;
  const [slugEdited, setSlugEdited] = useState(false);

  const form = useForm<InsertPetition>({
    resolver: zodResolver(insertPetitionSchema),
    defaultValues: petitionDefaults,
  });

  useEffect(() => {
    if (open) {
      if (petition) {
        form.reset({
          title: petition.title,
          slug: petition.slug,
          description: petition.description,
          goal: petition.goal,
          status: petition.status,
          primaryColor: petition.primaryColor ?? "#6366f1",
          shareText: petition.shareText ?? "",
          videoUrl: petition.videoUrl ?? "",
          bannerUrl: petition.bannerUrl ?? "",
          logoUrl: petition.logoUrl ?? "",
          collectPhone: petition.collectPhone ?? false,
          collectCity: petition.collectCity ?? true,
          collectState: petition.collectState ?? false,
          collectCpf: petition.collectCpf ?? false,
          collectEmail: petition.collectEmail ?? false,
          collectComment: petition.collectComment ?? true,
          requireEmail: petition.requireEmail ?? false,
          requirePhone: petition.requirePhone ?? false,
          requireLocation: petition.requireLocation ?? false,
          requireCpf: petition.requireCpf ?? false,
          requireComment: petition.requireComment ?? false,
          lgpdText: petition.lgpdText ?? "",
        });
        setSlugEdited(true);
      } else {
        form.reset(petitionDefaults);
        setSlugEdited(false);
      }
    }
  }, [open, petition]);

  const mutation = useMutation({
    mutationFn: async (data: InsertPetition) => {
      if (isEdit && petition) {
        return apiRequest("PATCH", `/api/petitions/${petition.id}`, data);
      }
      return apiRequest("POST", "/api/petitions", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/petitions"] });
      toast({ title: isEdit ? "Petição atualizada!" : "Petição criada!" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Erro ao salvar petição", variant: "destructive" });
    },
  });

  const onSubmit = (data: InsertPetition) => mutation.mutate(data);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="text-petition-form-title">
            {isEdit ? "Editar Petição" : "Nova Petição"}
          </DialogTitle>
          <DialogDescription>
            Configure os detalhes e os campos do formulário público da petição.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => {
                        field.onChange(e);
                        if (!slugEdited) {
                          form.setValue("slug", slugify(e.target.value));
                        }
                      }}
                      placeholder="Ex: Mais segurança no bairro"
                      data-testid="input-petition-title"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug (URL pública)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => {
                        setSlugEdited(true);
                        field.onChange(slugify(e.target.value));
                      }}
                      placeholder="mais-seguranca-no-bairro"
                      data-testid="input-petition-slug"
                    />
                  </FormControl>
                  <FormDescription>/p/{form.watch("slug") || "..."}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      rows={4}
                      placeholder="Descreva o objetivo da petição..."
                      data-testid="input-petition-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="goal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Meta de assinaturas</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        {...field}
                        value={field.value ?? 0}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        data-testid="input-petition-goal"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select
                      value={field.value ?? "rascunho"}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-petition-status">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="rascunho">Rascunho</SelectItem>
                        <SelectItem value="publicada">Publicada</SelectItem>
                        <SelectItem value="pausada">Pausada</SelectItem>
                        <SelectItem value="concluida">Concluída</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="primaryColor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cor primária</FormLabel>
                    <FormControl>
                      <Input
                        type="color"
                        {...field}
                        value={field.value ?? "#6366f1"}
                        className="h-9 p-1"
                        data-testid="input-petition-color"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="shareText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Texto de compartilhamento</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      placeholder="Assine esta petição e ajude nossa causa!"
                      data-testid="input-petition-sharetext"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="videoUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL do vídeo</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      placeholder="https://youtube.com/..."
                      data-testid="input-petition-video"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="bannerUrl"
                render={({ field }) => (
                  <FormItem>
                    <ImageUploadField
                      label="Banner"
                      value={field.value}
                      onChange={field.onChange}
                      testid="petition-banner"
                    />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="logoUrl"
                render={({ field }) => (
                  <FormItem>
                    <ImageUploadField
                      label="Logo"
                      value={field.value}
                      onChange={field.onChange}
                      testid="petition-logo"
                    />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            <div>
              <h3 className="mb-3 text-sm font-semibold text-foreground">
                Campos do formulário
              </h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <SwitchField control={form.control} name="collectPhone" label="Coletar telefone" testid="collectPhone" />
                <SwitchField control={form.control} name="requirePhone" label="Telefone obrigatório" testid="requirePhone" />
                <SwitchField control={form.control} name="collectEmail" label="Coletar e-mail" testid="collectEmail" />
                <SwitchField control={form.control} name="requireEmail" label="E-mail obrigatório" testid="requireEmail" />
                <SwitchField control={form.control} name="collectCity" label="Coletar cidade" testid="collectCity" />
                <SwitchField control={form.control} name="collectState" label="Coletar estado" testid="collectState" />
                <SwitchField control={form.control} name="requireLocation" label="Localização obrigatória" testid="requireLocation" />
                <SwitchField control={form.control} name="collectCpf" label="Coletar CPF" testid="collectCpf" />
                <SwitchField control={form.control} name="requireCpf" label="CPF obrigatório" testid="requireCpf" />
                <SwitchField control={form.control} name="collectComment" label="Coletar comentário" testid="collectComment" />
                <SwitchField control={form.control} name="requireComment" label="Comentário obrigatório" testid="requireComment" />
              </div>
            </div>

            <FormField
              control={form.control}
              name="lgpdText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Texto LGPD</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      rows={3}
                      placeholder="Ao assinar, você concorda com o tratamento dos seus dados..."
                      data-testid="input-petition-lgpd"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-petition"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-petition">
                {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Petition details dialog
// ============================================================================

function PetitionDetailsDialog({
  open,
  onOpenChange,
  petition,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  petition: PetitionWithCount | null;
}) {
  const { toast } = useToast();
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const publicLink = petition
    ? `${window.location.origin}/p/${petition.slug}`
    : "";

  const { data: signatures, isLoading } = useQuery<PetitionSignature[]>({
    queryKey: ["/api/petitions", petition?.id, "signatures"],
    enabled: open && !!petition,
  });

  useEffect(() => {
    let revoked: string | null = null;
    async function loadQr() {
      if (!open || !petition) return;
      setLoadingQr(true);
      try {
        const res = await fetch(`/api/petitions/${petition.id}/qrcode`, {
          headers: { Authorization: `Bearer ${getAuthToken()}` },
        });
        if (!res.ok) throw new Error();
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        revoked = url;
        setQrUrl(url);
      } catch {
        setQrUrl(null);
      } finally {
        setLoadingQr(false);
      }
    }
    loadQr();
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
      setQrUrl(null);
    };
  }, [open, petition?.id]);

  const deleteSignatureMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/petition-signatures/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/petitions", petition?.id, "signatures"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/petitions"] });
      toast({ title: "Assinatura removida!" });
    },
    onError: () => {
      toast({ title: "Erro ao remover assinatura", variant: "destructive" });
    },
  });

  const importMutation = useMutation({
    mutationFn: (rows: Record<string, string>[]) =>
      apiRequest("POST", `/api/petitions/${petition!.id}/signatures/import`, {
        signatures: rows,
      }),
    onSuccess: async (res: any) => {
      const data = await res.json();
      queryClient.invalidateQueries({
        queryKey: ["/api/petitions", petition?.id, "signatures"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/petitions"] });
      const parts = [`${data.success} importada(s)`];
      if (data.skipped) parts.push(`${data.skipped} duplicada(s)`);
      if (data.failed) parts.push(`${data.failed} com erro`);
      toast({ title: "Importação concluída", description: parts.join(" • ") });
    },
    onError: (e: any) => {
      toast({ title: "Erro ao importar", description: e.message, variant: "destructive" });
    },
  });

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (event.target) event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result || "");
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) {
        toast({ title: "CSV vazio ou sem linhas de dados", variant: "destructive" });
        return;
      }
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const rows = lines.slice(1).map((line) => {
        const values = line.split(",");
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => {
          obj[h] = (values[i] || "").trim();
        });
        return obj;
      });
      importMutation.mutate(rows);
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = () => {
    const template = "nome,email,telefone,cidade,estado,cpf,comentario\n";
    const blob = new Blob([template], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "template-assinaturas.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadQr = () => {
    if (!petition) return;
    downloadAuthedFile(
      `/api/petitions/${petition.id}/qrcode`,
      `qrcode-${petition.slug}.png`,
    ).catch(() => toast({ title: "Erro ao baixar QR Code", variant: "destructive" }));
  };

  const handleDownloadPdf = async () => {
    if (!petition) return;
    setDownloadingPdf(true);
    try {
      await downloadAuthedFile(
        `/api/petitions/${petition.id}/pdf`,
        `assinaturas-${petition.slug}.pdf`,
      );
    } catch {
      toast({ title: "Erro ao baixar PDF", variant: "destructive" });
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (!petition) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="text-petition-details-title">{petition.title}</DialogTitle>
          <DialogDescription>{petition.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Link público</p>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  readOnly
                  value={publicLink}
                  data-testid="input-petition-public-link"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(publicLink, toast)}
                  data-testid="button-copy-public-link"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadPdf}
                  disabled={downloadingPdf}
                  data-testid="button-download-pdf"
                >
                  {downloadingPdf ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                  Baixar PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadQr}
                  data-testid="button-download-qrcode"
                >
                  <Download className="h-4 w-4" />
                  Baixar QR Code
                </Button>
              </div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <p className="text-sm font-medium text-foreground">QR Code</p>
              {loadingQr ? (
                <Skeleton className="h-40 w-40 rounded-md" />
              ) : qrUrl ? (
                <img
                  src={qrUrl}
                  alt="QR Code da petição"
                  className="h-40 w-40 rounded-md border"
                  data-testid="img-petition-qrcode"
                />
              ) : (
                <div className="flex h-40 w-40 items-center justify-center rounded-md border text-muted-foreground">
                  <QrCode className="h-10 w-10" />
                </div>
              )}
            </div>
          </div>

          <Separator />

          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                Assinaturas
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" data-testid="badge-signatures-count">
                  {signatures?.length ?? petition.signaturesCount ?? 0} / {petition.goal}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadTemplate}
                  data-testid="button-download-template"
                >
                  <Download className="h-4 w-4" />
                  Modelo CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importMutation.isPending}
                  data-testid="button-import-signatures"
                >
                  {importMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Importar CSV
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleImportFile}
                  data-testid="input-import-csv"
                />
              </div>
            </div>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : !signatures || signatures.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma assinatura recebida ainda
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Cidade/UF</TableHead>
                      <TableHead>CPF</TableHead>
                      <TableHead>Comentário</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {signatures.map((sig) => (
                      <TableRow key={sig.id} data-testid={`row-signature-${sig.id}`}>
                        <TableCell className="font-medium text-foreground">{sig.name}</TableCell>
                        <TableCell className="text-muted-foreground">{sig.email || "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{sig.phone || "-"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {[sig.city, sig.state].filter(Boolean).join("/") || "-"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{sig.cpf || "-"}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground">
                          {sig.comment || "-"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {sig.createdAt
                            ? new Date(sig.createdAt).toLocaleDateString("pt-BR")
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteSignatureMutation.mutate(sig.id)}
                            data-testid={`button-delete-signature-${sig.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Petitions tab
// ============================================================================

function PetitionsTab() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editing, setEditing] = useState<PetitionWithCount | null>(null);
  const [selected, setSelected] = useState<PetitionWithCount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PetitionWithCount | null>(null);

  const { data: petitions, isLoading } = useQuery<PetitionWithCount[]>({
    queryKey: ["/api/petitions"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/petitions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/petitions"] });
      toast({ title: "Petição excluída!" });
      setDeleteTarget(null);
    },
    onError: () => {
      toast({ title: "Erro ao excluir petição", variant: "destructive" });
    },
  });

  const totalPetitions = petitions?.length ?? 0;
  const totalSignatures =
    petitions?.reduce((sum, p) => sum + (p.signaturesCount ?? 0), 0) ?? 0;
  const activeCount =
    petitions?.filter((p) => p.status === "publicada").length ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card data-testid="card-total-petitions">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Petições
            </CardTitle>
            <ScrollText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground" data-testid="text-total-petitions">
              {totalPetitions}
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-total-signatures">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Assinaturas
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground" data-testid="text-total-signatures">
              {totalSignatures}
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-active-petitions">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Petições Ativas
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground" data-testid="text-active-petitions">
              {activeCount}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">Petições</h2>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          data-testid="button-new-petition"
        >
          <Plus className="h-4 w-4" />
          Nova Petição
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : !petitions || petitions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhuma petição cadastrada. Crie a primeira!
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="min-w-[180px]">Progresso</TableHead>
                    <TableHead>Visualizações</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {petitions.map((p) => {
                    const count = p.signaturesCount ?? 0;
                    const pct = p.goal > 0 ? Math.min(100, (count / p.goal) * 100) : 0;
                    const statusCfg = PETITION_STATUS[p.status] ?? PETITION_STATUS.rascunho;
                    return (
                      <TableRow key={p.id} data-testid={`row-petition-${p.id}`}>
                        <TableCell className="font-medium text-foreground" data-testid={`text-petition-title-${p.id}`}>
                          {p.title}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusCfg.variant} data-testid={`badge-petition-status-${p.id}`}>
                            {statusCfg.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <Progress value={pct} className="h-2" />
                            <p className="text-xs text-muted-foreground">
                              {count} / {p.goal}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground" data-testid={`text-petition-views-${p.id}`}>
                          {p.viewsCount}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setSelected(p);
                                setDetailsOpen(true);
                              }}
                              title="Ver detalhes"
                              data-testid={`button-details-petition-${p.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                copyToClipboard(
                                  `${window.location.origin}/p/${p.slug}`,
                                  toast,
                                )
                              }
                              title="Copiar link público"
                              data-testid={`button-copy-petition-${p.id}`}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditing(p);
                                setFormOpen(true);
                              }}
                              title="Editar"
                              data-testid={`button-edit-petition-${p.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteTarget(p)}
                              title="Excluir"
                              data-testid={`button-delete-petition-${p.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <PetitionFormDialog open={formOpen} onOpenChange={setFormOpen} petition={editing} />
      <PetitionDetailsDialog open={detailsOpen} onOpenChange={setDetailsOpen} petition={selected} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir petição</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{deleteTarget?.title}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-petition">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              data-testid="button-confirm-delete-petition"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================================
// Campaign form dialog
// ============================================================================

const campaignDefaults: InsertPetitionCampaign = {
  name: "",
  type: "whatsapp",
  status: "rascunho",
  petitionId: null,
  message: "",
  subject: "",
  senderEmail: "",
  senderName: "",
  delaySeconds: 3,
  messagesPerHour: 20,
  avoidNightHours: true,
};

function CampaignFormDialog({
  open,
  onOpenChange,
  campaign,
  petitions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign?: PetitionCampaign | null;
  petitions: PetitionWithCount[];
}) {
  const { toast } = useToast();
  const isEdit = !!campaign;

  const form = useForm<InsertPetitionCampaign>({
    resolver: zodResolver(insertPetitionCampaignSchema),
    defaultValues: campaignDefaults,
  });

  useEffect(() => {
    if (open) {
      if (campaign) {
        form.reset({
          name: campaign.name,
          type: campaign.type as "whatsapp" | "email",
          status: campaign.status,
          petitionId: campaign.petitionId ?? null,
          message: campaign.message,
          subject: campaign.subject ?? "",
          senderEmail: campaign.senderEmail ?? "",
          senderName: campaign.senderName ?? "",
          delaySeconds: campaign.delaySeconds,
          messagesPerHour: campaign.messagesPerHour,
          avoidNightHours: campaign.avoidNightHours,
        });
      } else {
        form.reset(campaignDefaults);
      }
    }
  }, [open, campaign]);

  const mutation = useMutation({
    mutationFn: async (data: InsertPetitionCampaign) => {
      if (isEdit && campaign) {
        return apiRequest("PATCH", `/api/petition-campaigns/${campaign.id}`, data);
      }
      return apiRequest("POST", "/api/petition-campaigns", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/petition-campaigns"] });
      toast({ title: isEdit ? "Campanha atualizada!" : "Campanha criada!" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Erro ao salvar campanha", variant: "destructive" });
    },
  });

  const type = form.watch("type");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="text-campaign-form-title">
            {isEdit ? "Editar Campanha" : "Nova Campanha"}
          </DialogTitle>
          <DialogDescription>
            Configure o envio em massa de mensagens vinculadas a uma petição.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome da campanha</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} data-testid="input-campaign-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-campaign-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="email">E-mail</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value ?? "rascunho"} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-campaign-status">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="rascunho">Rascunho</SelectItem>
                        <SelectItem value="agendada">Agendada</SelectItem>
                        <SelectItem value="enviando">Enviando</SelectItem>
                        <SelectItem value="concluida">Concluída</SelectItem>
                        <SelectItem value="pausada">Pausada</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="petitionId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Petição vinculada</FormLabel>
                  <Select
                    value={field.value ?? "none"}
                    onValueChange={(v) => field.onChange(v === "none" ? null : v)}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-campaign-petition">
                        <SelectValue placeholder="Selecione uma petição" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {petitions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {type === "email" && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="subject"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assunto</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} data-testid="input-campaign-subject" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="senderName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome do remetente</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} data-testid="input-campaign-sendername" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="senderEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>E-mail do remetente</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} data-testid="input-campaign-senderemail" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}

            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mensagem</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      rows={5}
                      placeholder="Olá {nome}, assine nossa petição..."
                      data-testid="input-campaign-message"
                    />
                  </FormControl>
                  <FormDescription>
                    Use variáveis como {"{nome}"} para personalizar a mensagem.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="delaySeconds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Intervalo (segundos)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        {...field}
                        value={field.value ?? 0}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        data-testid="input-campaign-delay"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="messagesPerHour"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mensagens por hora</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        {...field}
                        value={field.value ?? 0}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        data-testid="input-campaign-perhour"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <SwitchField
              control={form.control}
              name="avoidNightHours"
              label="Evitar envios no período noturno"
              testid="avoidNightHours"
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-campaign"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-campaign">
                {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Campaign logs dialog
// ============================================================================

function CampaignLogsDialog({
  open,
  onOpenChange,
  campaign,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: PetitionCampaign | null;
}) {
  const { data: logs, isLoading } = useQuery<PetitionCampaignLog[]>({
    queryKey: ["/api/petition-campaigns", campaign?.id, "logs"],
    enabled: open && !!campaign,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="text-logs-title">Logs da Campanha</DialogTitle>
          <DialogDescription>{campaign?.name}</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !logs || logs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum log registrado para esta campanha
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Destinatário</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id} data-testid={`row-log-${log.id}`}>
                    <TableCell className="font-medium text-foreground">{log.recipientName}</TableCell>
                    <TableCell className="text-muted-foreground">{log.recipientContact}</TableCell>
                    <TableCell>
                      <Badge variant={log.status === "success" ? "default" : "destructive"}>
                        {log.status === "success" ? "Sucesso" : "Erro"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{log.errorMessage || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Campaigns tab
// ============================================================================

function CampaignsTab() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [editing, setEditing] = useState<PetitionCampaign | null>(null);
  const [logsTarget, setLogsTarget] = useState<PetitionCampaign | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PetitionCampaign | null>(null);
  const [runTarget, setRunTarget] = useState<PetitionCampaign | null>(null);
  const [accessToken, setAccessToken] = useState("");

  const { data: campaigns, isLoading } = useQuery<PetitionCampaign[]>({
    queryKey: ["/api/petition-campaigns"],
  });
  const { data: petitions } = useQuery<PetitionWithCount[]>({
    queryKey: ["/api/petitions"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/petition-campaigns/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/petition-campaigns"] });
      toast({ title: "Campanha excluída!" });
      setDeleteTarget(null);
    },
    onError: () => {
      toast({ title: "Erro ao excluir campanha", variant: "destructive" });
    },
  });

  const runMutation = useMutation({
    mutationFn: async (vars: { id: string; accessToken: string }) =>
      apiRequest("POST", `/api/petition-campaigns/${vars.id}/run`, {
        accessToken: vars.accessToken,
      }),
    onSuccess: async (res: any) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/petition-campaigns"] });
      toast({
        title: "Campanha disparada",
        description: `${data.success} enviada(s) • ${data.failed} falha(s) de ${data.total}`,
      });
      setRunTarget(null);
      setAccessToken("");
    },
    onError: (e: any) => {
      toast({ title: "Erro ao disparar campanha", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">Campanhas WhatsApp</h2>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          data-testid="button-new-campaign"
        >
          <Plus className="h-4 w-4" />
          Nova Campanha
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : !campaigns || campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhuma campanha cadastrada.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Enviadas</TableHead>
                    <TableHead>Sucesso</TableHead>
                    <TableHead>Falhas</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((c) => {
                    const statusCfg = CAMPAIGN_STATUS[c.status] ?? CAMPAIGN_STATUS.rascunho;
                    return (
                      <TableRow key={c.id} data-testid={`row-campaign-${c.id}`}>
                        <TableCell className="font-medium text-foreground">{c.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {c.type === "whatsapp" ? "WhatsApp" : "E-mail"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{c.sentCount}</TableCell>
                        <TableCell className="text-muted-foreground">{c.successCount}</TableCell>
                        <TableCell className="text-muted-foreground">{c.failedCount}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setAccessToken("");
                                setRunTarget(c);
                              }}
                              disabled={c.type !== "whatsapp" || c.status === "enviando"}
                              title="Disparar campanha"
                              data-testid={`button-run-campaign-${c.id}`}
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setLogsTarget(c);
                                setLogsOpen(true);
                              }}
                              title="Ver logs"
                              data-testid={`button-logs-campaign-${c.id}`}
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditing(c);
                                setFormOpen(true);
                              }}
                              title="Editar"
                              data-testid={`button-edit-campaign-${c.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteTarget(c)}
                              title="Excluir"
                              data-testid={`button-delete-campaign-${c.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <CampaignFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        campaign={editing}
        petitions={petitions ?? []}
      />
      <CampaignLogsDialog open={logsOpen} onOpenChange={setLogsOpen} campaign={logsTarget} />

      <Dialog open={!!runTarget} onOpenChange={(o) => { if (!o) { setRunTarget(null); setAccessToken(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle data-testid="text-run-campaign-title">Disparar campanha</DialogTitle>
            <DialogDescription>
              As mensagens serão enviadas via WhatsApp para os assinantes (com telefone)
              da petição vinculada. Informe o token de acesso da sua API de WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="run-access-token">Token de acesso (access-token)</Label>
            <Input
              id="run-access-token"
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="Cole aqui o token da API"
              data-testid="input-run-access-token"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setRunTarget(null); setAccessToken(""); }}
              data-testid="button-cancel-run"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => runTarget && runMutation.mutate({ id: runTarget.id, accessToken: accessToken.trim() })}
              disabled={!accessToken.trim() || runMutation.isPending}
              data-testid="button-confirm-run"
            >
              {runMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Disparar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campanha</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{deleteTarget?.name}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-campaign">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              data-testid="button-confirm-delete-campaign"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================================
// Template form dialog
// ============================================================================

const templateDefaults: InsertPetitionMessageTemplate = {
  name: "",
  type: "whatsapp",
  subject: "",
  content: "",
  isDefault: false,
  thumbnailUrl: "",
};

function TemplateFormDialog({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: PetitionMessageTemplate | null;
}) {
  const { toast } = useToast();
  const isEdit = !!template;

  const form = useForm<InsertPetitionMessageTemplate>({
    resolver: zodResolver(insertPetitionMessageTemplateSchema),
    defaultValues: templateDefaults,
  });

  useEffect(() => {
    if (open) {
      if (template) {
        form.reset({
          name: template.name,
          type: template.type as "whatsapp" | "email",
          subject: template.subject ?? "",
          content: template.content,
          isDefault: template.isDefault ?? false,
          thumbnailUrl: template.thumbnailUrl ?? "",
        });
      } else {
        form.reset(templateDefaults);
      }
    }
  }, [open, template]);

  const mutation = useMutation({
    mutationFn: async (data: InsertPetitionMessageTemplate) => {
      if (isEdit && template) {
        return apiRequest("PATCH", `/api/petition-message-templates/${template.id}`, data);
      }
      return apiRequest("POST", "/api/petition-message-templates", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/petition-message-templates"] });
      toast({ title: isEdit ? "Modelo atualizado!" : "Modelo criado!" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Erro ao salvar modelo", variant: "destructive" });
    },
  });

  const type = form.watch("type");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="text-template-form-title">
            {isEdit ? "Editar Modelo" : "Novo Modelo"}
          </DialogTitle>
          <DialogDescription>Crie modelos reutilizáveis de mensagem.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} data-testid="input-template-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger data-testid="select-template-type">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="email">E-mail</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {type === "email" && (
              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assunto</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} data-testid="input-template-subject" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Conteúdo</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      rows={5}
                      placeholder="Olá {nome}, ..."
                      data-testid="input-template-content"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <SwitchField
              control={form.control}
              name="isDefault"
              label="Definir como modelo padrão"
              testid="template-isDefault"
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-template"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-template">
                {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Templates tab
// ============================================================================

function TemplatesTab() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PetitionMessageTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PetitionMessageTemplate | null>(null);

  const { data: templates, isLoading } = useQuery<PetitionMessageTemplate[]>({
    queryKey: ["/api/petition-message-templates"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/petition-message-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/petition-message-templates"] });
      toast({ title: "Modelo excluído!" });
      setDeleteTarget(null);
    },
    onError: () => {
      toast({ title: "Erro ao excluir modelo", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">Modelos de Mensagem</h2>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          data-testid="button-new-template"
        >
          <Plus className="h-4 w-4" />
          Novo Modelo
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : !templates || templates.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhum modelo cadastrado.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Padrão</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((t) => (
                    <TableRow key={t.id} data-testid={`row-template-${t.id}`}>
                      <TableCell className="font-medium text-foreground">{t.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {t.type === "whatsapp" ? "WhatsApp" : "E-mail"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {t.isDefault ? (
                          <Badge variant="default">Padrão</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditing(t);
                              setFormOpen(true);
                            }}
                            title="Editar"
                            data-testid={`button-edit-template-${t.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTarget(t)}
                            title="Excluir"
                            data-testid={`button-delete-template-${t.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <TemplateFormDialog open={formOpen} onOpenChange={setFormOpen} template={editing} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir modelo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{deleteTarget?.name}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-template">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              data-testid="button-confirm-delete-template"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================================
// Link Bio form dialog
// ============================================================================

const linkBioDefaults: InsertLinkBioPage = {
  title: "",
  slug: "",
  description: "",
  avatarUrl: "",
  backgroundColor: "#6366f1",
  status: "rascunho",
  petitionIds: [],
};

function LinkBioFormDialog({
  open,
  onOpenChange,
  page,
  petitions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page?: LinkBioPage | null;
  petitions: PetitionWithCount[];
}) {
  const { toast } = useToast();
  const isEdit = !!page;
  const [slugEdited, setSlugEdited] = useState(false);

  const form = useForm<InsertLinkBioPage>({
    resolver: zodResolver(insertLinkBioPageSchema),
    defaultValues: linkBioDefaults,
  });

  useEffect(() => {
    if (open) {
      if (page) {
        form.reset({
          title: page.title,
          slug: page.slug,
          description: page.description ?? "",
          avatarUrl: page.avatarUrl ?? "",
          backgroundColor: page.backgroundColor ?? "#6366f1",
          status: page.status,
          petitionIds: page.petitionIds ?? [],
        });
        setSlugEdited(true);
      } else {
        form.reset(linkBioDefaults);
        setSlugEdited(false);
      }
    }
  }, [open, page]);

  const mutation = useMutation({
    mutationFn: async (data: InsertLinkBioPage) => {
      if (isEdit && page) {
        return apiRequest("PATCH", `/api/linkbio-pages/${page.id}`, data);
      }
      return apiRequest("POST", "/api/linkbio-pages", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/linkbio-pages"] });
      toast({ title: isEdit ? "Página atualizada!" : "Página criada!" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Erro ao salvar página", variant: "destructive" });
    },
  });

  const selectedIds = form.watch("petitionIds") ?? [];

  const togglePetition = (id: string, checked: boolean) => {
    const current = form.getValues("petitionIds") ?? [];
    if (checked) {
      form.setValue("petitionIds", [...current, id]);
    } else {
      form.setValue(
        "petitionIds",
        current.filter((x) => x !== id),
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="text-linkbio-form-title">
            {isEdit ? "Editar Link Bio" : "Nova Página Link Bio"}
          </DialogTitle>
          <DialogDescription>
            Agrupe várias petições em uma página de bio.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => {
                        field.onChange(e);
                        if (!slugEdited) form.setValue("slug", slugify(e.target.value));
                      }}
                      data-testid="input-linkbio-title"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => {
                        setSlugEdited(true);
                        field.onChange(slugify(e.target.value));
                      }}
                      data-testid="input-linkbio-slug"
                    />
                  </FormControl>
                  <FormDescription>/bio/{form.watch("slug") || "..."}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      rows={3}
                      data-testid="input-linkbio-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="backgroundColor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cor de fundo</FormLabel>
                    <FormControl>
                      <Input
                        type="color"
                        {...field}
                        value={field.value ?? "#6366f1"}
                        className="h-9 p-1"
                        data-testid="input-linkbio-color"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value ?? "rascunho"} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-linkbio-status">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="rascunho">Rascunho</SelectItem>
                        <SelectItem value="publicada">Publicada</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="avatarUrl"
              render={({ field }) => (
                <FormItem>
                  <ImageUploadField
                    label="Avatar"
                    value={field.value}
                    onChange={field.onChange}
                    testid="linkbio-avatar"
                  />
                </FormItem>
              )}
            />
            <div>
              <FormLabel>Petições incluídas</FormLabel>
              <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
                {petitions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma petição disponível.</p>
                ) : (
                  petitions.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-2 text-sm text-foreground"
                    >
                      <Checkbox
                        checked={selectedIds.includes(p.id)}
                        onCheckedChange={(c) => togglePetition(p.id, !!c)}
                        data-testid={`checkbox-linkbio-petition-${p.id}`}
                      />
                      {p.title}
                    </label>
                  ))
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-linkbio"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-linkbio">
                {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Link Bio tab
// ============================================================================

function LinkBioTab() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LinkBioPage | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LinkBioPage | null>(null);

  const { data: pages, isLoading } = useQuery<LinkBioPage[]>({
    queryKey: ["/api/linkbio-pages"],
  });
  const { data: petitions } = useQuery<PetitionWithCount[]>({
    queryKey: ["/api/petitions"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/linkbio-pages/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/linkbio-pages"] });
      toast({ title: "Página excluída!" });
      setDeleteTarget(null);
    },
    onError: () => {
      toast({ title: "Erro ao excluir página", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">Link Bio</h2>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          data-testid="button-new-linkbio"
        >
          <Plus className="h-4 w-4" />
          Nova Página
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : !pages || pages.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhuma página cadastrada.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Visualizações</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pages.map((p) => (
                    <TableRow key={p.id} data-testid={`row-linkbio-${p.id}`}>
                      <TableCell className="font-medium text-foreground">{p.title}</TableCell>
                      <TableCell className="text-muted-foreground">/bio/{p.slug}</TableCell>
                      <TableCell>
                        <Badge variant={p.status === "publicada" ? "default" : "secondary"}>
                          {p.status === "publicada" ? "Publicada" : "Rascunho"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{p.viewsCount}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              copyToClipboard(`${window.location.origin}/bio/${p.slug}`, toast)
                            }
                            title="Copiar link"
                            data-testid={`button-copy-linkbio-${p.id}`}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditing(p);
                              setFormOpen(true);
                            }}
                            title="Editar"
                            data-testid={`button-edit-linkbio-${p.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTarget(p)}
                            title="Excluir"
                            data-testid={`button-delete-linkbio-${p.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <LinkBioFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        page={editing}
        petitions={petitions ?? []}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir página</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{deleteTarget?.title}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-linkbio">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              data-testid="button-confirm-delete-linkbio"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================================
// Link Tree form dialog
// ============================================================================

const linkTreeDefaults: InsertLinkTreePage = {
  title: "",
  slug: "",
  description: "",
  avatarUrl: "",
  backgroundColor: "#ffffff",
  textColor: "#000000",
  status: "rascunho",
  links: [],
};

function LinkTreeFormDialog({
  open,
  onOpenChange,
  page,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page?: LinkTreePage | null;
}) {
  const { toast } = useToast();
  const isEdit = !!page;
  const [slugEdited, setSlugEdited] = useState(false);

  const form = useForm<InsertLinkTreePage>({
    resolver: zodResolver(insertLinkTreePageSchema),
    defaultValues: linkTreeDefaults,
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "links",
  });

  useEffect(() => {
    if (open) {
      if (page) {
        form.reset({
          title: page.title,
          slug: page.slug,
          description: page.description ?? "",
          avatarUrl: page.avatarUrl ?? "",
          backgroundColor: page.backgroundColor ?? "#ffffff",
          textColor: page.textColor ?? "#000000",
          status: page.status,
          links: (page.links as LinkTreeLink[]) ?? [],
        });
        setSlugEdited(true);
      } else {
        form.reset(linkTreeDefaults);
        setSlugEdited(false);
      }
    }
  }, [open, page]);

  const mutation = useMutation({
    mutationFn: async (data: InsertLinkTreePage) => {
      if (isEdit && page) {
        return apiRequest("PATCH", `/api/linktree-pages/${page.id}`, data);
      }
      return apiRequest("POST", "/api/linktree-pages", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/linktree-pages"] });
      toast({ title: isEdit ? "Página atualizada!" : "Página criada!" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Erro ao salvar página", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="text-linktree-form-title">
            {isEdit ? "Editar Link Tree" : "Nova Página Link Tree"}
          </DialogTitle>
          <DialogDescription>
            Crie uma página com diversos links personalizados.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => {
                        field.onChange(e);
                        if (!slugEdited) form.setValue("slug", slugify(e.target.value));
                      }}
                      data-testid="input-linktree-title"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => {
                        setSlugEdited(true);
                        field.onChange(slugify(e.target.value));
                      }}
                      data-testid="input-linktree-slug"
                    />
                  </FormControl>
                  <FormDescription>/tree/{form.watch("slug") || "..."}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      rows={3}
                      data-testid="input-linktree-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="backgroundColor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cor de fundo</FormLabel>
                    <FormControl>
                      <Input
                        type="color"
                        {...field}
                        value={field.value ?? "#ffffff"}
                        className="h-9 p-1"
                        data-testid="input-linktree-bgcolor"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="textColor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cor do texto</FormLabel>
                    <FormControl>
                      <Input
                        type="color"
                        {...field}
                        value={field.value ?? "#000000"}
                        className="h-9 p-1"
                        data-testid="input-linktree-textcolor"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value ?? "rascunho"} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-linktree-status">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="rascunho">Rascunho</SelectItem>
                        <SelectItem value="publicada">Publicada</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="avatarUrl"
              render={({ field }) => (
                <FormItem>
                  <ImageUploadField
                    label="Avatar"
                    value={field.value}
                    onChange={field.onChange}
                    testid="linktree-avatar"
                  />
                </FormItem>
              )}
            />

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <FormLabel>Links</FormLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    append({ id: crypto.randomUUID(), title: "", url: "", icon: "" })
                  }
                  data-testid="button-add-link"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar link
                </Button>
              </div>
              <div className="space-y-3">
                {fields.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum link adicionado.</p>
                ) : (
                  fields.map((field, index) => (
                    <div
                      key={field.id}
                      className="grid grid-cols-1 gap-2 rounded-md border p-3 md:grid-cols-[1fr_1fr_1fr_auto]"
                      data-testid={`row-link-${index}`}
                    >
                      <FormField
                        control={form.control}
                        name={`links.${index}.title`}
                        render={({ field: f }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                {...f}
                                value={f.value ?? ""}
                                placeholder="Título"
                                data-testid={`input-link-title-${index}`}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`links.${index}.url`}
                        render={({ field: f }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                {...f}
                                value={f.value ?? ""}
                                placeholder="https://..."
                                data-testid={`input-link-url-${index}`}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`links.${index}.icon`}
                        render={({ field: f }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                {...f}
                                value={f.value ?? ""}
                                placeholder="Ícone (opcional)"
                                data-testid={`input-link-icon-${index}`}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(index)}
                        data-testid={`button-remove-link-${index}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-linktree"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-linktree">
                {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Link Tree tab
// ============================================================================

function LinkTreeTab() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LinkTreePage | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LinkTreePage | null>(null);

  const { data: pages, isLoading } = useQuery<LinkTreePage[]>({
    queryKey: ["/api/linktree-pages"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/linktree-pages/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/linktree-pages"] });
      toast({ title: "Página excluída!" });
      setDeleteTarget(null);
    },
    onError: () => {
      toast({ title: "Erro ao excluir página", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">Link Tree</h2>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          data-testid="button-new-linktree"
        >
          <Plus className="h-4 w-4" />
          Nova Página
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : !pages || pages.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhuma página cadastrada.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Visualizações</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pages.map((p) => (
                    <TableRow key={p.id} data-testid={`row-linktree-${p.id}`}>
                      <TableCell className="font-medium text-foreground">{p.title}</TableCell>
                      <TableCell className="text-muted-foreground">/tree/{p.slug}</TableCell>
                      <TableCell>
                        <Badge variant={p.status === "publicada" ? "default" : "secondary"}>
                          {p.status === "publicada" ? "Publicada" : "Rascunho"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{p.viewsCount}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              copyToClipboard(`${window.location.origin}/tree/${p.slug}`, toast)
                            }
                            title="Copiar link"
                            data-testid={`button-copy-linktree-${p.id}`}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditing(p);
                              setFormOpen(true);
                            }}
                            title="Editar"
                            data-testid={`button-edit-linktree-${p.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTarget(p)}
                            title="Excluir"
                            data-testid={`button-delete-linktree-${p.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <LinkTreeFormDialog open={formOpen} onOpenChange={setFormOpen} page={editing} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir página</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{deleteTarget?.title}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-linktree">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              data-testid="button-confirm-delete-linktree"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================================
// Main page
// ============================================================================

export default function Petitions() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground" data-testid="text-page-title">
          Petições
        </h1>
        <p className="mt-1 text-muted-foreground">
          Crie e gerencie abaixo-assinados, campanhas e páginas de links
        </p>
      </div>

      <Tabs defaultValue="petitions" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="petitions" data-testid="tab-petitions">
            <ScrollText className="h-4 w-4" />
            Petições
          </TabsTrigger>
          <TabsTrigger value="campaigns" data-testid="tab-campaigns">
            <MessageSquare className="h-4 w-4" />
            Campanhas WhatsApp
          </TabsTrigger>
          <TabsTrigger value="templates" data-testid="tab-templates">
            <Mail className="h-4 w-4" />
            Modelos de Mensagem
          </TabsTrigger>
          <TabsTrigger value="linkbio" data-testid="tab-linkbio">
            <LinkIcon className="h-4 w-4" />
            Link Bio
          </TabsTrigger>
          <TabsTrigger value="linktree" data-testid="tab-linktree">
            <ListTree className="h-4 w-4" />
            Link Tree
          </TabsTrigger>
        </TabsList>

        <TabsContent value="petitions">
          <PetitionsTab />
        </TabsContent>
        <TabsContent value="campaigns">
          <CampaignsTab />
        </TabsContent>
        <TabsContent value="templates">
          <TemplatesTab />
        </TabsContent>
        <TabsContent value="linkbio">
          <LinkBioTab />
        </TabsContent>
        <TabsContent value="linktree">
          <LinkTreeTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
