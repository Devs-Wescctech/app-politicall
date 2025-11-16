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
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

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
  const [isDialogOpen, setIsDialogOpen] = useState(false);
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
      setIsDialogOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Erro ao criar aliança", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/alliances/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alliances"] });
      toast({ title: "Aliança excluída com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao excluir aliança", variant: "destructive" });
    },
  });

  const handleSubmit = (data: InsertPoliticalAlliance) => {
    createMutation.mutate(data);
  };

  const handleDelete = (id: string) => {
    if (confirm("Tem certeza que deseja excluir esta aliança?")) {
      deleteMutation.mutate(id);
    }
  };

  const ideologyDistribution = alliances?.reduce((acc, alliance) => {
    if (alliance.party) {
      const ideology = alliance.party.ideology;
      acc[ideology] = (acc[ideology] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const chartData = ideologyDistribution
    ? Object.entries(ideologyDistribution).map(([ideology, count]) => ({
        ideology,
        count,
      }))
    : [];

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Aliança Política</h1>
          <p className="text-muted-foreground mt-2">Gerencie seus aliados políticos</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-alliance">
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
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-alliance">
                    {createMutation.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Partidos Políticos do Brasil (2025)</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingParties ? (
                <div className="space-y-3">
                  {[...Array(10)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {parties?.map((party) => (
                    <div
                      key={party.id}
                      className="p-3 rounded-lg border-l-4 bg-card hover-elevate"
                      style={{ borderLeftColor: IDEOLOGY_COLORS[party.ideology as keyof typeof IDEOLOGY_COLORS] }}
                      data-testid={`party-${party.acronym}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <h4 className="font-semibold text-sm">{party.acronym}</h4>
                          <p className="text-xs text-muted-foreground">{party.name}</p>
                        </div>
                        <Badge className={IDEOLOGY_BADGES[party.ideology as keyof typeof IDEOLOGY_BADGES]}>
                          {party.ideology}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {chartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Distribuição Ideológica das Alianças</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ ideology, percent }) => `${ideology}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="count"
                      nameKey="ideology"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={IDEOLOGY_COLORS[entry.ideology as keyof typeof IDEOLOGY_COLORS]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Meus Aliados</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingAlliances ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : alliances && alliances.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {alliances.map((alliance) => (
                    <Card key={alliance.id} data-testid={`alliance-${alliance.id}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <CardTitle className="text-base">{alliance.allyName}</CardTitle>
                            {alliance.position && (
                              <p className="text-sm text-muted-foreground">{alliance.position}</p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(alliance.id)}
                            data-testid={`button-delete-alliance-${alliance.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 space-y-2">
                        {alliance.party && (
                          <Badge className={IDEOLOGY_BADGES[alliance.party.ideology as keyof typeof IDEOLOGY_BADGES]}>
                            {alliance.party.acronym} - {alliance.party.ideology}
                          </Badge>
                        )}
                        {alliance.phone && (
                          <p className="text-sm text-muted-foreground">📞 {alliance.phone}</p>
                        )}
                        {alliance.email && (
                          <p className="text-sm text-muted-foreground">✉️ {alliance.email}</p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  Nenhuma aliança cadastrada. Clique em "Nova Aliança" para começar.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
