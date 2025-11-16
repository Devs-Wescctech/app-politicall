import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type PoliticalAlliance, type PoliticalParty, type InsertPoliticalAlliance, insertPoliticalAllianceSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, Mail, MessageCircle, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";

const IDEOLOGY_COLORS = {
  'Esquerda': '#ef4444',
  'Centro-Esquerda': '#f97316',
  'Centro': '#eab308',
  'Centro-Direita': '#3b82f6',
  'Direita': '#6366f1',
};

const IDEOLOGY_BADGES = {
  'Esquerda': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  'Centro-Esquerda': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'Centro': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  'Centro-Direita': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'Direita': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
};

interface AllianceWithParty extends PoliticalAlliance {
  party?: PoliticalParty;
}

export default function Alliances() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedParty, setSelectedParty] = useState<PoliticalParty | null>(null);
  const [selectedAlliance, setSelectedAlliance] = useState<AllianceWithParty | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const { toast } = useToast();

  const { data: alliances, isLoading: loadingAlliances } = useQuery<AllianceWithParty[]>({
    queryKey: ["/api/alliances"],
  });

  const { data: parties, isLoading: loadingParties } = useQuery<PoliticalParty[]>({
    queryKey: ["/api/parties"],
  });

  const form = useForm<InsertPoliticalAlliance>({
    resolver: zodResolver(insertPoliticalAllianceSchema),
    defaultValues: {
      partyId: "",
      allyName: "",
      position: "",
      phone: "",
      email: "",
      notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertPoliticalAlliance) => apiRequest("POST", "/api/alliances", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alliances"] });
      toast({ title: "Aliança criada com sucesso!" });
      setIsCreateDialogOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Erro ao criar aliança", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertPoliticalAlliance> }) =>
      apiRequest("PATCH", `/api/alliances/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alliances"] });
      toast({ title: "Aliado atualizado com sucesso!" });
      setSelectedAlliance(null);
      setIsEditMode(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Erro ao atualizar aliado", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/alliances/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alliances"] });
      toast({ title: "Aliado excluído com sucesso!" });
      setSelectedAlliance(null);
      setSelectedParty(null);
    },
    onError: () => {
      toast({ title: "Erro ao excluir aliado", variant: "destructive" });
    },
  });

  const handleSubmit = (data: InsertPoliticalAlliance) => {
    if (isEditMode && selectedAlliance) {
      updateMutation.mutate({ id: selectedAlliance.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Tem certeza que deseja excluir este aliado?")) {
      deleteMutation.mutate(id);
    }
  };

  const handlePartyClick = (party: PoliticalParty) => {
    setSelectedParty(party);
  };

  const handleAllianceClick = (alliance: AllianceWithParty) => {
    setSelectedAlliance(alliance);
    setIsEditMode(false);
  };

  const handleEditClick = () => {
    if (selectedAlliance) {
      form.reset({
        partyId: selectedAlliance.partyId,
        allyName: selectedAlliance.allyName,
        position: selectedAlliance.position || "",
        phone: selectedAlliance.phone || "",
        email: selectedAlliance.email || "",
        notes: selectedAlliance.notes || "",
      });
      setIsEditMode(true);
    }
  };

  const getPartyAllianceCount = (partyId: string) => {
    return alliances?.filter((a) => a.partyId === partyId).length || 0;
  };

  const getPartyAlliances = (partyId: string) => {
    return alliances?.filter((a) => a.partyId === partyId) || [];
  };

  const handleEmailClick = (email: string) => {
    window.location.href = `mailto:${email}`;
  };

  const handleWhatsAppClick = (phone: string) => {
    const cleanPhone = phone.replace(/\D/g, "");
    const internationalPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
    window.open(`https://wa.me/${internationalPhone}`, "_blank");
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Aliança Política</h1>
          <p className="text-muted-foreground mt-2">Clique em um partido para ver seus aliados</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-alliance" className="rounded-full">
              <Plus className="w-4 h-4 mr-2" />
              Nova Aliança
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Nova Aliança</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="partyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Partido *</FormLabel>
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
                <FormField
                  control={form.control}
                  name="allyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome do Aliado *</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome completo" data-testid="input-ally-name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="position"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cargo</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Deputado Federal" data-testid="input-ally-position" {...field} />
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
                        <Input placeholder="(00) 00000-0000" data-testid="input-ally-phone" {...field} />
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
                        <Input type="email" placeholder="email@exemplo.com" data-testid="input-ally-email" {...field} />
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
                        <Textarea placeholder="Notas adicionais" data-testid="input-ally-notes" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-alliance" className="rounded-full">
                    {createMutation.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {loadingParties ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {[...Array(29)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {parties?.map((party) => {
            const count = getPartyAllianceCount(party.id);
            return (
              <Card
                key={party.id}
                className="cursor-pointer hover-elevate transition-all"
                onClick={() => handlePartyClick(party)}
                data-testid={`party-card-${party.acronym}`}
                style={{ borderTop: `4px solid ${IDEOLOGY_COLORS[party.ideology as keyof typeof IDEOLOGY_COLORS]}` }}
              >
                <CardContent className="p-4 flex flex-col items-center justify-center text-center min-h-[120px] relative">
                  <div className="absolute top-2 right-2">
                    <div
                      className="rounded-full bg-primary text-primary-foreground w-8 h-8 flex items-center justify-center text-sm font-bold"
                      data-testid={`party-count-${party.acronym}`}
                    >
                      {count}
                    </div>
                  </div>
                  <h3 className="font-bold text-lg mb-1">{party.acronym}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-2">{party.name}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!selectedParty} onOpenChange={(open) => !open && setSelectedParty(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>{selectedParty?.acronym}</span>
              <Badge className={selectedParty ? IDEOLOGY_BADGES[selectedParty.ideology as keyof typeof IDEOLOGY_BADGES] : ""}>
                {selectedParty?.ideology}
              </Badge>
            </DialogTitle>
            <p className="text-sm text-muted-foreground">{selectedParty?.name}</p>
          </DialogHeader>
          <div className="space-y-3">
            {selectedParty && getPartyAlliances(selectedParty.id).length > 0 ? (
              getPartyAlliances(selectedParty.id).map((alliance) => (
                <div
                  key={alliance.id}
                  className="p-4 border rounded-lg hover-elevate flex items-center justify-between gap-4"
                  data-testid={`alliance-item-${alliance.id}`}
                >
                  <div
                    className="flex-1 cursor-pointer"
                    onClick={() => handleAllianceClick(alliance)}
                  >
                    <h4 className="font-semibold">{alliance.allyName}</h4>
                    {alliance.position && (
                      <p className="text-sm text-muted-foreground">{alliance.position}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {alliance.email && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEmailClick(alliance.email!);
                        }}
                        data-testid={`button-email-${alliance.id}`}
                        className="rounded-full"
                      >
                        <Mail className="w-4 h-4" />
                      </Button>
                    )}
                    {alliance.phone && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleWhatsAppClick(alliance.phone!);
                        }}
                        data-testid={`button-whatsapp-${alliance.id}`}
                        className="rounded-full"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                Nenhum aliado cadastrado neste partido.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedAlliance && !isEditMode} onOpenChange={(open) => !open && setSelectedAlliance(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedAlliance?.allyName}</DialogTitle>
            {selectedAlliance?.position && (
              <p className="text-sm text-muted-foreground">{selectedAlliance.position}</p>
            )}
          </DialogHeader>
          <div className="space-y-4">
            {selectedAlliance?.party && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Partido</label>
                <div className="mt-1">
                  <Badge className={IDEOLOGY_BADGES[selectedAlliance.party.ideology as keyof typeof IDEOLOGY_BADGES]}>
                    {selectedAlliance.party.acronym} - {selectedAlliance.party.ideology}
                  </Badge>
                </div>
              </div>
            )}
            {selectedAlliance?.phone && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Telefone</label>
                <p className="text-base mt-1">{selectedAlliance.phone}</p>
              </div>
            )}
            {selectedAlliance?.email && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Email</label>
                <p className="text-base mt-1">{selectedAlliance.email}</p>
              </div>
            )}
            {selectedAlliance?.notes && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Observações</label>
                <p className="text-base mt-1">{selectedAlliance.notes}</p>
              </div>
            )}
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleEditClick}
              data-testid="button-edit-alliance"
              className="rounded-full"
            >
              <Edit className="w-4 h-4 mr-2" />
              Editar
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedAlliance && handleDelete(selectedAlliance.id)}
              data-testid="button-delete-alliance"
              className="rounded-full"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditMode} onOpenChange={(open) => {
        if (!open) {
          setIsEditMode(false);
          form.reset();
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Aliado</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="partyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Partido *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-party">
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
              <FormField
                control={form.control}
                name="allyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do Aliado *</FormLabel>
                    <FormControl>
                      <Input placeholder="Nome completo" data-testid="input-edit-ally-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="position"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cargo</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Deputado Federal" data-testid="input-edit-ally-position" {...field} />
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
                      <Input placeholder="(00) 00000-0000" data-testid="input-edit-ally-phone" {...field} />
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
                      <Input type="email" placeholder="email@exemplo.com" data-testid="input-edit-ally-email" {...field} />
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
                      <Textarea placeholder="Notas adicionais" data-testid="input-edit-ally-notes" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={updateMutation.isPending} data-testid="button-update-alliance" className="rounded-full">
                  {updateMutation.isPending ? "Atualizando..." : "Atualizar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
