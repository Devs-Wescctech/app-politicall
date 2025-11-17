import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Edit } from "lucide-react";
import { getAuthUser } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PoliticalParty } from "@shared/schema";
import { POLITICAL_POSITIONS } from "@shared/schema";

const profileSchema = z.object({
  name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres"),
  phone: z.string().optional(),
  partyId: z.string().optional(),
  politicalPosition: z.string().optional(),
  lastElectionVotes: z.string().optional(),
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
    partyId?: string;
    politicalPosition?: string;
    lastElectionVotes?: number;
  }>({
    queryKey: ["/api/auth/me"],
  });

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: currentUser?.name || "",
      phone: currentUser?.phone || "",
      partyId: currentUser?.partyId || "",
      politicalPosition: currentUser?.politicalPosition || "",
      lastElectionVotes: currentUser?.lastElectionVotes?.toString() || "",
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileForm) => {
      const payload = {
        ...data,
        lastElectionVotes: data.lastElectionVotes ? parseInt(data.lastElectionVotes) : undefined,
      };
      return await apiRequest("/api/auth/profile", "PATCH", payload);
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

  const onSubmitProfile = (data: ProfileForm) => {
    updateProfileMutation.mutate(data);
  };

  const handleEditClick = () => {
    form.reset({
      name: currentUser?.name || "",
      phone: currentUser?.phone || "",
      partyId: currentUser?.partyId || "",
      politicalPosition: currentUser?.politicalPosition || "",
      lastElectionVotes: currentUser?.lastElectionVotes?.toString() || "",
    });
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
                <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-12 h-12 text-primary" />
                </div>
              </div>
              <div className="text-center">
                <p className="font-semibold text-lg">{user?.name}</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
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
                          type="number" 
                          placeholder="Número de votos" 
                          {...field} 
                          data-testid="input-votes" 
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
