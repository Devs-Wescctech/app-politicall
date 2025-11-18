import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Edit, Camera } from "lucide-react";
import { getAuthUser } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState, useRef } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PoliticalParty } from "@shared/schema";
import { POLITICAL_POSITIONS } from "@shared/schema";
import { BRAZILIAN_STATES, getCitiesByState } from "@shared/brazilian-locations";
import { useEffect } from "react";

const profileSchema = z.object({
  name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres"),
  phone: z.string().optional(),
  partyId: z.string().optional(),
  politicalPosition: z.string().optional(),
  lastElectionVotes: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().optional(),
  confirmPassword: z.string().optional(),
}).refine((data) => {
  if (data.newPassword && !data.currentPassword) {
    return false;
  }
  return true;
}, {
  message: "Senha atual é obrigatória para alterar a senha",
  path: ["currentPassword"],
}).refine((data) => {
  if (data.newPassword && data.newPassword.length < 6) {
    return false;
  }
  return true;
}, {
  message: "Nova senha deve ter no mínimo 6 caracteres",
  path: ["newPassword"],
}).refine((data) => {
  if (data.newPassword && data.newPassword !== data.confirmPassword) {
    return false;
  }
  return true;
}, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

type ProfileForm = z.infer<typeof profileSchema>;

export default function Settings() {
  const user = getAuthUser();
  const { toast } = useToast();
  const [showEditDialog, setShowEditDialog] = useState(false);

  const { data: parties } = useQuery<PoliticalParty[]>({
    queryKey: ["/api/parties"],
  });

  const { data: currentUser } = useQuery<{
    id: string;
    name: string;
    email: string;
    phone?: string;
    avatar?: string;
    partyId?: string;
    politicalPosition?: string;
    lastElectionVotes?: number;
    state?: string;
    city?: string;
  }>({
    queryKey: ["/api/auth/me"],
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedState, setSelectedState] = useState(currentUser?.state || "");
  const [availableCities, setAvailableCities] = useState<string[]>([]);

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: currentUser?.name || "",
      phone: currentUser?.phone || "",
      partyId: currentUser?.partyId || "",
      politicalPosition: currentUser?.politicalPosition || "",
      lastElectionVotes: currentUser?.lastElectionVotes?.toString() || "",
      state: currentUser?.state || "",
      city: currentUser?.city || "",
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileForm) => {
      const cleanedVotes = data.lastElectionVotes?.replace(/\D/g, '') || '';
      const votesNumber = cleanedVotes ? parseInt(cleanedVotes, 10) : undefined;
      
      const payload: any = {
        name: data.name,
        phone: data.phone || undefined,
        partyId: data.partyId || undefined,
        politicalPosition: data.politicalPosition || undefined,
        lastElectionVotes: votesNumber,
        state: data.state || undefined,
        city: data.city || undefined,
      };

      if (data.newPassword && data.currentPassword) {
        payload.currentPassword = data.currentPassword;
        payload.newPassword = data.newPassword;
      }

      return await apiRequest("PATCH", "/api/auth/profile", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Sucesso",
        description: "Perfil atualizado com sucesso",
      });
      setShowEditDialog(false);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message || "Erro ao atualizar perfil",
      });
    },
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: async (avatar: string) => {
      return await apiRequest("PATCH", "/api/auth/profile", { avatar });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Sucesso",
        description: "Foto de perfil atualizada",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message || "Erro ao enviar foto",
      });
    },
  });

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Por favor, selecione uma imagem",
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "A imagem deve ter no máximo 2MB",
      });
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      uploadAvatarMutation.mutate(base64);
    };
    reader.readAsDataURL(file);
  };

  const onSubmitProfile = (data: ProfileForm) => {
    updateProfileMutation.mutate(data);
  };

  useEffect(() => {
    if (currentUser?.state) {
      setSelectedState(currentUser.state);
      setAvailableCities(getCitiesByState(currentUser.state));
    }
  }, [currentUser]);

  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === "state" && value.state) {
        setSelectedState(value.state);
        const cities = getCitiesByState(value.state);
        setAvailableCities(cities);
        
        if (value.city && !cities.includes(value.city)) {
          form.setValue("city", "");
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const handleEditClick = () => {
    const formattedVotes = currentUser?.lastElectionVotes 
      ? currentUser.lastElectionVotes.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
      : "";
    
    form.reset({
      name: currentUser?.name || "",
      phone: currentUser?.phone || "",
      partyId: currentUser?.partyId || "",
      politicalPosition: currentUser?.politicalPosition || "",
      lastElectionVotes: formattedVotes,
      state: currentUser?.state || "",
      city: currentUser?.city || "",
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
    
    if (currentUser?.state) {
      setSelectedState(currentUser.state);
      setAvailableCities(getCitiesByState(currentUser.state));
    }
    
    setShowEditDialog(true);
  };

  const selectedParty = parties?.find(p => p.id === form.watch("partyId"));

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Configurações</h1>
        <p className="text-muted-foreground mt-2">Gerencie suas preferências e informações da conta</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Informações da Conta</CardTitle>
                  <CardDescription>Detalhes do seu perfil político</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEditClick}
                  className="rounded-full"
                  data-testid="button-edit-profile"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Editar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Nome Completo</label>
                <p className="text-base mt-1" data-testid="text-user-name">{currentUser?.name || "-"}</p>
              </div>
              <Separator />
              <div>
                <label className="text-sm font-medium text-muted-foreground">Telefone</label>
                <p className="text-base mt-1" data-testid="text-user-phone">{currentUser?.phone || "-"}</p>
              </div>
              <Separator />
              <div>
                <label className="text-sm font-medium text-muted-foreground">Email</label>
                <p className="text-base mt-1" data-testid="text-user-email">{currentUser?.email || "-"}</p>
              </div>
              <Separator />
              <div>
                <label className="text-sm font-medium text-muted-foreground">Partido Político</label>
                <p className="text-base mt-1" data-testid="text-user-party">
                  {parties && currentUser?.partyId 
                    ? parties.find(p => p.id === currentUser.partyId)?.acronym || "-"
                    : "-"}
                </p>
              </div>
              <Separator />
              <div>
                <label className="text-sm font-medium text-muted-foreground">Cargo Político</label>
                <p className="text-base mt-1" data-testid="text-user-position">{currentUser?.politicalPosition || "-"}</p>
              </div>
              <Separator />
              <div>
                <label className="text-sm font-medium text-muted-foreground">Ideologia</label>
                <p className="text-base mt-1" data-testid="text-user-ideology">
                  {parties && currentUser?.partyId 
                    ? parties.find(p => p.id === currentUser.partyId)?.ideology || "-"
                    : "-"}
                </p>
              </div>
              <Separator />
              <div>
                <label className="text-sm font-medium text-muted-foreground">Votos na Última Eleição</label>
                <p className="text-base mt-1" data-testid="text-user-votes">
                  {currentUser?.lastElectionVotes ? currentUser.lastElectionVotes.toLocaleString('pt-BR') : "-"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sobre a Plataforma</CardTitle>
              <CardDescription>Informações do sistema</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Versão</label>
                <p className="text-base mt-1">1.0.0</p>
              </div>
              <Separator />
              <div>
                <label className="text-sm font-medium text-muted-foreground">Plataforma</label>
                <p className="text-base mt-1">Gestão Política Completa</p>
              </div>
              
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Perfil
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-center">
                <div 
                  className="relative w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center cursor-pointer hover-elevate group"
                  onClick={handleAvatarClick}
                  data-testid="avatar-upload"
                >
                  {currentUser?.avatar ? (
                    <img 
                      src={currentUser.avatar} 
                      alt="Avatar" 
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <User className="w-12 h-12 text-primary" />
                  )}
                  <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="w-8 h-8 text-white" />
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                  data-testid="input-avatar"
                />
              </div>
              <div className="text-center">
                <p className="font-semibold text-lg">{currentUser?.name}</p>
                <p className="text-sm text-muted-foreground">{currentUser?.email}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recursos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Eleitores</span>
                  <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20">Ativo</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Alianças</span>
                  <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20">Ativo</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Demandas</span>
                  <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20">Ativo</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Agenda</span>
                  <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20">Ativo</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Atendimento IA</span>
                  <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20">Ativo</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Marketing</span>
                  <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20">Ativo</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Profile Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0" data-testid="dialog-edit-profile">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle>Editar Perfil Político</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitProfile)} className="flex flex-col flex-1 overflow-hidden">
              <div className="overflow-y-auto px-6 py-4 space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome Completo</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome completo do político" {...field} data-testid="input-name" />
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
                        <Input placeholder="(00) 00000-0000" {...field} data-testid="input-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="partyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Partido Político</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-party">
                            <SelectValue placeholder="Selecione o partido" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {parties?.map((party) => (
                            <SelectItem key={party.id} value={party.id}>
                              {party.acronym} - {party.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {selectedParty && (
                  <div className="bg-muted/50 p-3 rounded-md">
                    <p className="text-sm font-medium">Ideologia:</p>
                    <p className="text-sm text-muted-foreground">{selectedParty.ideology}</p>
                  </div>
                )}
                <FormField
                  control={form.control}
                  name="politicalPosition"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cargo Político</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-position">
                            <SelectValue placeholder="Selecione o cargo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {POLITICAL_POSITIONS.map((position) => (
                            <SelectItem key={position} value={position}>
                              {position}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastElectionVotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Votos na Última Eleição</FormLabel>
                      <FormControl>
                        <Input 
                          type="text" 
                          placeholder="0.000.000" 
                          value={field.value || ''}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, '');
                            if (value === '') {
                              field.onChange('');
                              return;
                            }
                            const formatted = value.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
                            field.onChange(formatted);
                          }}
                          data-testid="input-votes" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estado</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-state">
                            <SelectValue placeholder="Selecione o estado" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {BRAZILIAN_STATES.map((state) => (
                            <SelectItem key={state.value} value={state.value}>
                              {state.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cidade</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        value={field.value}
                        disabled={!selectedState || availableCities.length === 0}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-city">
                            <SelectValue placeholder={selectedState ? "Selecione a cidade" : "Selecione um estado primeiro"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availableCities.map((city) => (
                            <SelectItem key={city} value={city}>
                              {city}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Separator className="my-4" />
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Alterar Senha (Opcional)</h3>
                  <p className="text-xs text-muted-foreground">Deixe em branco para manter a senha atual</p>
                </div>
                <FormField
                  control={form.control}
                  name="currentPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Senha Atual</FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          placeholder="Digite sua senha atual" 
                          {...field} 
                          data-testid="input-current-password" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nova Senha</FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          placeholder="Digite a nova senha (mín. 6 caracteres)" 
                          {...field} 
                          data-testid="input-new-password" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirmar Nova Senha</FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          placeholder="Digite a nova senha novamente" 
                          {...field} 
                          data-testid="input-confirm-password" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter className="px-6 py-4 border-t grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowEditDialog(false)}
                  data-testid="button-cancel"
                  className="rounded-full w-full"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={updateProfileMutation.isPending}
                  data-testid="button-save"
                  className="rounded-full w-full"
                >
                  {updateProfileMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
