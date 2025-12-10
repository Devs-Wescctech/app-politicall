import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type FieldOperative, type Contact } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  Plus, Pencil, Trash2, Copy, QrCode, Download, ExternalLink,
  Phone, Mail, Users, UserPlus, Calendar, Eye, X, Upload, Image
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { getAuthToken } from "@/lib/auth";
import { useCurrentUser } from "@/hooks/use-current-user";
import { QRCodeSVG } from 'qrcode.react';

const formSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  phone: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface FieldOperativeStats {
  totalContacts: number;
  recentContacts: number;
}

export default function FieldOperatives() {
  const { toast } = useToast();
  const { user: currentUser } = useCurrentUser();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingOperative, setEditingOperative] = useState<FieldOperative | null>(null);
  const [viewingOperative, setViewingOperative] = useState<FieldOperative | null>(null);
  const [deletingOperative, setDeletingOperative] = useState<FieldOperative | null>(null);
  
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const qrCodeRef = useRef<HTMLDivElement>(null);

  const { data: adminData } = useQuery<any>({
    queryKey: ["/api/account/admin"],
  });

  const baseSlug = currentUser?.role === 'admin' ? currentUser?.slug : adminData?.slug;

  const { data: operatives, isLoading } = useQuery<FieldOperative[]>({
    queryKey: ["/api/field-operatives"],
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const formData = new FormData();
      formData.append("name", data.name);
      if (data.phone) formData.append("phone", data.phone);
      if (data.email) formData.append("email", data.email);
      if (data.notes) formData.append("notes", data.notes);
      if (avatarFile) formData.append("avatar", avatarFile);
      if (coverFile) formData.append("coverImage", coverFile);

      const token = getAuthToken();
      const res = await fetch("/api/field-operatives", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Erro ao criar cabo eleitoral");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/field-operatives"] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast({ title: "Cabo eleitoral criado com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar cabo eleitoral", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: FormData }) => {
      const formData = new FormData();
      formData.append("name", data.name);
      if (data.phone) formData.append("phone", data.phone);
      if (data.email) formData.append("email", data.email);
      if (data.notes) formData.append("notes", data.notes);
      if (avatarFile) formData.append("avatar", avatarFile);
      if (coverFile) formData.append("coverImage", coverFile);

      const token = getAuthToken();
      const res = await fetch(`/api/field-operatives/${id}`, {
        method: "PATCH",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Erro ao atualizar cabo eleitoral");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/field-operatives"] });
      setEditingOperative(null);
      resetForm();
      toast({ title: "Cabo eleitoral atualizado com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar cabo eleitoral", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/field-operatives/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/field-operatives"] });
      setDeletingOperative(null);
      toast({ title: "Cabo eleitoral removido com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao remover cabo eleitoral", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    form.reset();
    setAvatarFile(null);
    setAvatarPreview(null);
    setCoverFile(null);
    setCoverPreview(null);
  };

  const openEditDialog = (operative: FieldOperative) => {
    setEditingOperative(operative);
    form.reset({
      name: operative.name,
      phone: operative.phone || "",
      email: operative.email || "",
      notes: operative.notes || "",
    });
    setAvatarPreview(operative.avatarUrl || null);
    setCoverPreview(operative.coverImageUrl || null);
  };

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "avatar" | "cover"
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (type === "avatar") {
          setAvatarFile(file);
          setAvatarPreview(reader.result as string);
        } else {
          setCoverFile(file);
          setCoverPreview(reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const getLandingPageUrl = (operative: FieldOperative) => {
    return `https://www.politicall.com.br/cabo/${baseSlug}/${operative.slug}`;
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: "Link copiado para a área de transferência!" });
  };

  const downloadQRCode = (operative: FieldOperative) => {
    const svg = document.getElementById(`qr-${operative.id}`);
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new window.Image();
    
    img.onload = () => {
      canvas.width = 256;
      canvas.height = 256;
      ctx?.drawImage(img, 0, 0, 256, 256);
      const pngUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `qrcode-${operative.slug}.png`;
      link.href = pngUrl;
      link.click();
    };
    
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  const onSubmit = (data: FormData) => {
    if (editingOperative) {
      updateMutation.mutate({ id: editingOperative.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const totalContacts = operatives?.reduce((acc, op) => acc, 0) || 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Cabo Eleitoral</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie seus cabos eleitorais e suas páginas de captação de eleitores
          </p>
        </div>
        <Button 
          onClick={() => {
            resetForm();
            setIsCreateDialogOpen(true);
          }}
          data-testid="button-create-operative"
        >
          <Plus className="h-4 w-4 mr-2" />
          Novo Cabo Eleitoral
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Cabos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-operatives">
              {isLoading ? <Skeleton className="h-8 w-16" /> : operatives?.length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cabos Ativos</CardTitle>
            <UserPlus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-active-operatives">
              {isLoading ? <Skeleton className="h-8 w-16" /> : operatives?.filter(o => o.isActive).length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-16 w-16 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : operatives?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhum cabo eleitoral cadastrado</h3>
            <p className="text-muted-foreground text-center mb-4">
              Crie cabos eleitorais para gerarem páginas de captação de eleitores
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-operative-empty">
              <Plus className="h-4 w-4 mr-2" />
              Criar primeiro cabo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {operatives?.map(operative => (
            <OperativeCard
              key={operative.id}
              operative={operative}
              landingUrl={getLandingPageUrl(operative)}
              onEdit={() => openEditDialog(operative)}
              onDelete={() => setDeletingOperative(operative)}
              onView={() => setViewingOperative(operative)}
              onCopyUrl={() => copyToClipboard(getLandingPageUrl(operative))}
              onDownloadQR={() => downloadQRCode(operative)}
            />
          ))}
        </div>
      )}

      <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
        if (!open) resetForm();
        setIsCreateDialogOpen(open);
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Cabo Eleitoral</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-4">
                  <Avatar className="h-24 w-24 cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
                    {avatarPreview ? (
                      <AvatarImage src={avatarPreview} alt="Avatar" />
                    ) : (
                      <AvatarFallback>
                        <Upload className="h-8 w-8 text-muted-foreground" />
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileChange(e, "avatar")}
                    data-testid="input-avatar"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => avatarInputRef.current?.click()}>
                    Foto do Cabo
                  </Button>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Imagem de Capa</label>
                  <div 
                    className="border-2 border-dashed rounded-lg p-4 cursor-pointer hover-elevate text-center"
                    onClick={() => coverInputRef.current?.click()}
                  >
                    {coverPreview ? (
                      <img src={coverPreview} alt="Cover" className="w-full h-32 object-cover rounded" />
                    ) : (
                      <div className="flex flex-col items-center gap-2 py-4">
                        <Image className="h-8 w-8 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Clique para adicionar imagem de capa</span>
                      </div>
                    )}
                  </div>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileChange(e, "cover")}
                    data-testid="input-cover"
                  />
                </div>
              </div>

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Nome do cabo eleitoral" data-testid="input-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="(00) 00000-0000" data-testid="input-phone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" placeholder="email@exemplo.com" data-testid="input-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observações</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Informações adicionais..." data-testid="input-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-create">
                  {createMutation.isPending ? "Criando..." : "Criar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingOperative} onOpenChange={(open) => {
        if (!open) {
          setEditingOperative(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Cabo Eleitoral</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-4">
                  <Avatar className="h-24 w-24 cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
                    {avatarPreview ? (
                      <AvatarImage src={avatarPreview} alt="Avatar" />
                    ) : (
                      <AvatarFallback>
                        <Upload className="h-8 w-8 text-muted-foreground" />
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileChange(e, "avatar")}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => avatarInputRef.current?.click()}>
                    Alterar foto
                  </Button>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Imagem de Capa</label>
                  <div 
                    className="border-2 border-dashed rounded-lg p-4 cursor-pointer hover-elevate text-center"
                    onClick={() => coverInputRef.current?.click()}
                  >
                    {coverPreview ? (
                      <img src={coverPreview} alt="Cover" className="w-full h-32 object-cover rounded" />
                    ) : (
                      <div className="flex flex-col items-center gap-2 py-4">
                        <Image className="h-8 w-8 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Clique para adicionar imagem de capa</span>
                      </div>
                    )}
                  </div>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileChange(e, "cover")}
                  />
                </div>
              </div>

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Nome do cabo eleitoral" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="(00) 00000-0000" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" placeholder="email@exemplo.com" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observações</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Informações adicionais..." />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingOperative(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={updateMutation.isPending} data-testid="button-submit-edit">
                  {updateMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deletingOperative} onOpenChange={(open) => !open && setDeletingOperative(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <p>
            Tem certeza que deseja excluir o cabo eleitoral <strong>{deletingOperative?.name}</strong>?
            Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingOperative(null)}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => deletingOperative && deleteMutation.mutate(deletingOperative.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {viewingOperative && (
        <DetailsDialog
          operative={viewingOperative}
          landingUrl={getLandingPageUrl(viewingOperative)}
          onClose={() => setViewingOperative(null)}
          onCopyUrl={() => copyToClipboard(getLandingPageUrl(viewingOperative))}
          onDownloadQR={() => downloadQRCode(viewingOperative)}
        />
      )}
    </div>
  );
}

function OperativeCard({
  operative,
  landingUrl,
  onEdit,
  onDelete,
  onView,
  onCopyUrl,
  onDownloadQR,
}: {
  operative: FieldOperative;
  landingUrl: string;
  onEdit: () => void;
  onDelete: () => void;
  onView: () => void;
  onCopyUrl: () => void;
  onDownloadQR: () => void;
}) {
  const { data: stats } = useQuery<FieldOperativeStats>({
    queryKey: ["/api/field-operatives", operative.id, "stats"],
  });

  const initials = operative.name
    .split(" ")
    .map(n => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Card className="hover-elevate" data-testid={`card-operative-${operative.id}`}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Avatar className="h-16 w-16 flex-shrink-0">
              {operative.avatarUrl ? (
                <AvatarImage src={operative.avatarUrl} alt={operative.name} />
              ) : null}
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h3 className="font-semibold truncate" data-testid={`text-operative-name-${operative.id}`}>
                {operative.name}
              </h3>
              {operative.phone && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {operative.phone}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={operative.isActive ? "default" : "secondary"} className="text-xs">
                  {operative.isActive ? "Ativo" : "Inativo"}
                </Badge>
                {stats && (
                  <span className="text-xs text-muted-foreground">
                    {stats.totalContacts} contatos
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={onView} data-testid={`button-view-${operative.id}`}>
            <Eye className="h-4 w-4 mr-1" />
            Ver
          </Button>
          <Button size="sm" variant="outline" onClick={onCopyUrl} data-testid={`button-copy-url-${operative.id}`}>
            <Copy className="h-4 w-4 mr-1" />
            Link
          </Button>
          <Button size="sm" variant="outline" onClick={onDownloadQR} data-testid={`button-download-qr-${operative.id}`}>
            <QrCode className="h-4 w-4 mr-1" />
            QR
          </Button>
          <div className="flex-1" />
          <Button size="icon" variant="ghost" onClick={onEdit} data-testid={`button-edit-${operative.id}`}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onDelete} data-testid={`button-delete-${operative.id}`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="hidden">
          <QRCodeSVG
            id={`qr-${operative.id}`}
            value={landingUrl}
            size={256}
            level="H"
            includeMargin
          />
        </div>
      </CardContent>
    </Card>
  );
}

function DetailsDialog({
  operative,
  landingUrl,
  onClose,
  onCopyUrl,
  onDownloadQR,
}: {
  operative: FieldOperative;
  landingUrl: string;
  onClose: () => void;
  onCopyUrl: () => void;
  onDownloadQR: () => void;
}) {
  const { data: stats, isLoading: statsLoading } = useQuery<FieldOperativeStats>({
    queryKey: ["/api/field-operatives", operative.id, "stats"],
  });

  const { data: contacts, isLoading: contactsLoading } = useQuery<Contact[]>({
    queryKey: ["/api/field-operatives", operative.id, "contacts"],
  });

  const initials = operative.name
    .split(" ")
    .map(n => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes do Cabo Eleitoral</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {operative.coverImageUrl && (
            <div className="w-full h-32 rounded-lg overflow-hidden">
              <img
                src={operative.coverImageUrl}
                alt="Cover"
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              {operative.avatarUrl ? (
                <AvatarImage src={operative.avatarUrl} alt={operative.name} />
              ) : null}
              <AvatarFallback className="text-xl">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-xl font-bold" data-testid="text-details-name">{operative.name}</h2>
              <Badge variant={operative.isActive ? "default" : "secondary"}>
                {operative.isActive ? "Ativo" : "Inativo"}
              </Badge>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {operative.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{operative.phone}</span>
              </div>
            )}
            {operative.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{operative.email}</span>
              </div>
            )}
          </div>

          {operative.notes && (
            <div>
              <h4 className="font-medium mb-1">Observações</h4>
              <p className="text-muted-foreground">{operative.notes}</p>
            </div>
          )}

          <div className="space-y-3">
            <h4 className="font-medium">Link da Página de Captação</h4>
            <div className="flex items-center gap-2">
              <Input value={landingUrl} readOnly className="flex-1" data-testid="input-landing-url" />
              <Button size="icon" variant="outline" onClick={onCopyUrl}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="outline" asChild>
                <a href={landingUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>

          <div className="flex flex-col items-center gap-4 p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium">QR Code</h4>
            <div className="bg-white p-4 rounded-lg">
              <QRCodeSVG
                id={`qr-details-${operative.id}`}
                value={landingUrl}
                size={180}
                level="H"
                includeMargin
              />
            </div>
            <Button variant="outline" onClick={onDownloadQR} data-testid="button-download-qr-details">
              <Download className="h-4 w-4 mr-2" />
              Baixar QR Code
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total de Contatos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-stats-total">
                  {statsLoading ? <Skeleton className="h-8 w-16" /> : stats?.totalContacts || 0}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Últimos 7 dias
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-stats-recent">
                  {statsLoading ? <Skeleton className="h-8 w-16" /> : stats?.recentContacts || 0}
                </div>
              </CardContent>
            </Card>
          </div>

          {contacts && contacts.length > 0 && (
            <div>
              <h4 className="font-medium mb-3">Contatos Registrados ({contacts.length})</h4>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {contacts.map(contact => (
                  <div 
                    key={contact.id} 
                    className="flex items-center gap-3 p-2 rounded-lg bg-muted/30"
                    data-testid={`contact-item-${contact.id}`}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {contact.name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{contact.name}</p>
                      {contact.phone && (
                        <p className="text-xs text-muted-foreground">{contact.phone}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
