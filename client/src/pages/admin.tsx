import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { User, Inbox, Mail, Phone, Trash2, Search, Sun, Moon, Users, X, Key } from "lucide-react";
import { AdminBottomNav } from "@/components/admin-bottom-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import logoUrl from "@assets/logo pol_1763308638963.png";
import type { Lead } from "@shared/schema";

export default function Admin() {
  const [, setLocation] = useLocation();
  const [isVerifying, setIsVerifying] = useState(true);
  const [inboxDialogOpen, setInboxDialogOpen] = useState(false);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState<string | null>(null);
  const [passwordResetDialogOpen, setPasswordResetDialogOpen] = useState(false);
  const [userToResetPassword, setUserToResetPassword] = useState<{ id: string; name: string } | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [confirmResetPassword, setConfirmResetPassword] = useState("");
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return true;
  });
  const { toast } = useToast();

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (newMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  useEffect(() => {
    async function verifyAdminToken() {
      const token = localStorage.getItem("admin_token");
      
      if (!token) {
        setLocation("/admin-login");
        return;
      }

      try {
        const response = await fetch("/api/admin/verify", {
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        });

        const result = await response.json();
        
        if (!result.valid) {
          localStorage.removeItem("admin_token");
          setLocation("/admin-login");
        } else {
          setIsVerifying(false);
        }
      } catch (error) {
        localStorage.removeItem("admin_token");
        setLocation("/admin-login");
      }
    }

    verifyAdminToken();
  }, [setLocation]);

  // Fetch leads from inbox
  const { data: leads = [], isLoading: leadsLoading, error: leadsError } = useQuery<Lead[]>({
    queryKey: ["/api/leads"],
    queryFn: async () => {
      const token = localStorage.getItem("admin_token");
      const response = await fetch("/api/leads", {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        throw new Error("Erro ao carregar leads");
      }
      
      return response.json();
    },
    enabled: !isVerifying,
  });

  // Delete single lead mutation
  const deleteLeadMutation = useMutation({
    mutationFn: async (leadId: string) => {
      const token = localStorage.getItem("admin_token");
      const response = await fetch(`/api/leads/${leadId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error("Erro ao excluir cadastro");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({
        title: "Cadastro excluído",
        description: "O cadastro foi excluído com sucesso.",
      });
      setDeleteConfirmOpen(false);
      setLeadToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete multiple leads mutation
  const deleteMultipleLeadsMutation = useMutation({
    mutationFn: async (leadIds: string[]) => {
      const token = localStorage.getItem("admin_token");
      const response = await fetch("/api/leads/delete-multiple", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: leadIds }),
      });
      
      if (!response.ok) {
        throw new Error("Erro ao excluir cadastros");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({
        title: "Cadastros excluídos",
        description: `${selectedLeads.size} cadastro(s) excluído(s) com sucesso.`,
      });
      setSelectedLeads(new Set());
      setDeleteConfirmOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle select all/deselect all
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedLeads(new Set(leads.map(lead => lead.id)));
    } else {
      setSelectedLeads(new Set());
    }
  };

  // Handle individual lead selection
  const handleLeadSelection = (leadId: string, checked: boolean) => {
    const newSelection = new Set(selectedLeads);
    if (checked) {
      newSelection.add(leadId);
    } else {
      newSelection.delete(leadId);
    }
    setSelectedLeads(newSelection);
  };

  // Handle delete confirmation
  const handleDeleteConfirm = () => {
    if (leadToDelete) {
      deleteLeadMutation.mutate(leadToDelete);
    } else if (selectedLeads.size > 0) {
      deleteMultipleLeadsMutation.mutate(Array.from(selectedLeads));
    }
  };

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const token = localStorage.getItem("admin_token");
      const response = await fetch(`/api/admin/users/${userId}/password`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erro ao resetar senha");
      }
      
      return response.json();
    },
    onSuccess: () => {
      setPasswordResetDialogOpen(false);
      setUserToResetPassword(null);
      setResetPassword("");
      setConfirmResetPassword("");
      toast({
        title: "Senha alterada",
        description: "A senha do usuário foi alterada com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao resetar senha",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleResetPasswordClick = (user: { id: string; name: string }) => {
    setUserToResetPassword(user);
    setPasswordResetDialogOpen(true);
  };

  const handleResetPasswordConfirm = () => {
    if (!userToResetPassword) return;
    
    if (resetPassword.length < 6) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "A senha deve ter pelo menos 6 caracteres",
      });
      return;
    }
    
    if (resetPassword !== confirmResetPassword) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "As senhas não coincidem",
      });
      return;
    }
    
    resetPasswordMutation.mutate({ userId: userToResetPassword.id, password: resetPassword });
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    setLocation("/login");
  };

  if (isVerifying) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Fixed Header */}
      <header className="sticky top-0 z-50 bg-card border-b shrink-0">
        <div className="flex items-center justify-between px-6 py-4">
          <img src={logoUrl} alt="Politicall Logo" className="h-10" data-testid="img-logo" />
          <div className="flex items-center gap-3">
            <Button 
              size="icon"
              variant="ghost"
              onClick={toggleDarkMode}
              className="rounded-full"
              data-testid="button-toggle-dark-mode"
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>
            <Button 
              onClick={handleLogout} 
              variant="outline"
              className="rounded-full w-32"
              data-testid="button-logout"
            >
              Sair
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content - Admin Dashboard */}
      <main className="flex-1 container mx-auto p-6 pb-24">
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2" data-testid="text-admin-title">Painel Administrativo</h2>
          <p className="text-sm text-muted-foreground" data-testid="text-admin-subtitle">
            Gerencie leads e usuários do sistema
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card 
            className="cursor-pointer hover-elevate"
            onClick={() => setInboxDialogOpen(true)}
            data-testid="card-inbox"
          >
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <Inbox className="h-5 w-5 text-[#40E0D0]" />
                Caixa de Entrada
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{leads.length}</p>
              <p className="text-sm text-muted-foreground">Leads da landing page</p>
            </CardContent>
          </Card>

          <Card data-testid="card-users-stats">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-[#40E0D0]" />
                Usuários
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Gerenciamento de usuários disponível na caixa de entrada
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Bottom Navigation */}
      <AdminBottomNav 
        activePage="dashboard" 
        onInboxClick={() => setInboxDialogOpen(true)}
        onSearchClick={() => {
          const searchInput = document.querySelector('[data-testid="input-search"]') as HTMLInputElement;
          if (searchInput) {
            searchInput.focus();
            searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }}
      />


      {/* Inbox Dialog - Leads from Landing Page */}
      <Dialog open={inboxDialogOpen} onOpenChange={setInboxDialogOpen}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 [&>button]:hidden" data-testid="dialog-inbox">
          {/* Fixed Header */}
          <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <DialogTitle data-testid="text-dialog-inbox-title">
                  Caixa de Entrada
                </DialogTitle>
                <DialogDescription data-testid="text-dialog-inbox-description">
                  Cadastros realizados através do formulário da landing page
                </DialogDescription>
              </div>
              {leads.length > 0 && (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="select-all-leads"
                      checked={selectedLeads.size === leads.length && leads.length > 0}
                      onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
                      data-testid="checkbox-select-all-leads"
                    />
                    <label 
                      htmlFor="select-all-leads" 
                      className="text-sm font-medium cursor-pointer"
                    >
                      Selecionar todos
                    </label>
                  </div>
                  {selectedLeads.size > 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setLeadToDelete(null);
                        setDeleteConfirmOpen(true);
                      }}
                      disabled={deleteMultipleLeadsMutation.isPending}
                      title={`Excluir ${selectedLeads.size} selecionado(s)`}
                      data-testid="button-delete-selected-header"
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {leadsLoading && (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-4 border rounded-lg">
                    <Skeleton className="h-5 w-3/4 mb-2" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ))}
              </div>
            )}

            {leadsError && (
              <div className="text-center py-12">
                <p className="text-destructive font-medium mb-2">
                  Erro ao carregar cadastros
                </p>
                <p className="text-sm text-muted-foreground">
                  {(leadsError as Error).message}
                </p>
              </div>
            )}

            {!leadsLoading && !leadsError && leads.length === 0 && (
              <div className="text-center py-12">
                <Inbox className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  Nenhum cadastro encontrado
                </p>
              </div>
            )}

            {!leadsLoading && leads.length > 0 && (
              <div className="space-y-3">
                {leads.map((lead) => (
                  <Card key={lead.id} className="hover-elevate" data-testid={`lead-card-${lead.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedLeads.has(lead.id)}
                          onCheckedChange={(checked) => handleLeadSelection(lead.id, checked as boolean)}
                          data-testid={`checkbox-lead-${lead.id}`}
                          className="mt-1"
                        />
                        <div className="flex items-start justify-between gap-4 flex-1">
                          <div className="flex-1">
                            <CardTitle className="text-base font-semibold mb-1" data-testid={`lead-name-${lead.id}`}>
                              {lead.name}
                            </CardTitle>
                            <p className="text-sm text-muted-foreground">
                              {lead.position} • {lead.city}/{lead.state}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-xs text-muted-foreground">
                              {new Date(lead.createdAt).toLocaleDateString('pt-BR')}
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                setLeadToDelete(lead.id);
                                setDeleteConfirmOpen(true);
                              }}
                              data-testid={`button-delete-lead-${lead.id}`}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex items-center gap-4 text-sm">
                        {lead.email && (
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-muted-foreground" />
                            <a 
                              href={`mailto:${lead.email}`}
                              className="text-primary hover:underline"
                              data-testid={`lead-email-${lead.id}`}
                            >
                              {lead.email}
                            </a>
                          </div>
                        )}
                        {lead.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4 text-muted-foreground" />
                            <a 
                              href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                              data-testid={`lead-phone-${lead.id}`}
                            >
                              {lead.phone}
                            </a>
                          </div>
                        )}
                      </div>
                      {lead.message && (
                        <Collapsible>
                          <CollapsibleTrigger className="w-full mt-3 p-3 bg-muted rounded-lg flex items-center justify-between hover-elevate cursor-pointer">
                            <span className="text-sm text-muted-foreground font-medium flex items-center gap-2">
                              <MessageSquare className="w-4 h-4" />
                              Mensagem
                            </span>
                            <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-2 px-3 pb-3">
                            <p className="text-sm" data-testid={`lead-message-${lead.id}`}>
                              {lead.message}
                            </p>
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Fixed Footer */}
          <div className="flex-shrink-0 px-6 py-4 border-t flex items-center justify-between">
            <div className="flex items-center gap-2">
              {selectedLeads.size > 0 && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    setLeadToDelete(null);
                    setDeleteConfirmOpen(true);
                  }}
                  disabled={deleteMultipleLeadsMutation.isPending}
                  data-testid="button-delete-selected-leads"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir selecionados ({selectedLeads.size})
                </Button>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setInboxDialogOpen(false);
                setSelectedLeads(new Set());
              }}
              data-testid="button-close-inbox"
            >
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent data-testid="dialog-delete-confirm">
          <DialogHeader>
            <DialogTitle>
              {leadToDelete ? "Excluir cadastro" : `Excluir ${selectedLeads.size} cadastro(s)`}
            </DialogTitle>
            <DialogDescription>
              {leadToDelete 
                ? "Tem certeza que deseja excluir este cadastro? Esta ação não pode ser desfeita."
                : `Tem certeza que deseja excluir ${selectedLeads.size} cadastro(s) selecionado(s)? Esta ação não pode ser desfeita.`
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteConfirmOpen(false);
                setLeadToDelete(null);
              }}
              disabled={deleteLeadMutation.isPending || deleteMultipleLeadsMutation.isPending}
              data-testid="button-cancel-delete"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteLeadMutation.isPending || deleteMultipleLeadsMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {(deleteLeadMutation.isPending || deleteMultipleLeadsMutation.isPending) ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Survey Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-2xl h-[85vh] flex flex-col p-0 [&>button]:hidden" data-testid="dialog-survey-details">
          {/* Fixed Header */}
          <div className="flex-shrink-0 p-6 pb-4 border-b bg-gradient-to-r from-[#40E0D0]/10 to-[#48D1CC]/5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                {selectedCampaign?.user && (
                  <Avatar className="w-12 h-12 flex-shrink-0 border-2 border-[#40E0D0]/30">
                    <AvatarImage src={selectedCampaign.user.avatar || undefined} alt={selectedCampaign.user.name} />
                    <AvatarFallback className="bg-[#40E0D0]/10">
                      <User className="w-6 h-6 text-[#40E0D0]" />
                    </AvatarFallback>
                  </Avatar>
                )}
                <div>
                  <DialogTitle className="text-lg font-semibold" data-testid="text-details-title">
                    {selectedCampaign?.campaignName}
                  </DialogTitle>
                  <DialogDescription className="mt-1" data-testid="text-details-user">
                    {selectedCampaign?.user?.name} • {selectedCampaign?.user?.email}
                  </DialogDescription>
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setDetailsDialogOpen(false)}
                className="flex-shrink-0"
                data-testid="button-close-details"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            
            <div className="flex flex-wrap gap-3 mt-4 text-sm font-medium">
              {selectedCampaign?.status && (
                <span 
                  className={
                    selectedCampaign.status === "approved" ? "text-[#40E0D0]" : 
                    selectedCampaign.status === "rejected" ? "text-destructive" : "text-muted-foreground"
                  }
                >
                  {selectedCampaign.status === "approved" ? "Aprovada" : 
                   selectedCampaign.status === "rejected" ? "Rejeitada" : "Em Análise"}
                </span>
              )}
              {selectedCampaign?.campaignStage && (
                <span className="text-muted-foreground">
                  {selectedCampaign.campaignStage === "pre_campaign" ? "Pré-Campanha" :
                   selectedCampaign.campaignStage === "campaign" ? "Em Campanha" : "Finalizado"}
                </span>
              )}
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>Data de Criação</span>
                </div>
                <p className="text-sm font-medium" data-testid="text-details-created">
                  {selectedCampaign?.createdAt && format(new Date(selectedCampaign.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>
              
              {selectedCampaign?.viewCount !== undefined && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <BarChart3 className="w-4 h-4" />
                    <span>Visualizações</span>
                  </div>
                  <p className="text-sm font-medium" data-testid="text-details-views">
                    {selectedCampaign.viewCount.toLocaleString('pt-BR')}
                  </p>
                </div>
              )}
            </div>

            {/* Region and Target Audience */}
            {(selectedCampaign?.region || selectedCampaign?.targetAudience) && (
              <div className="grid grid-cols-2 gap-4">
                {selectedCampaign?.region && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="w-4 h-4" />
                      <span>Região</span>
                    </div>
                    <p className="text-sm font-medium" data-testid="text-details-region">
                      {selectedCampaign.region}
                    </p>
                  </div>
                )}
                
                {selectedCampaign?.targetAudience && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="w-4 h-4" />
                      <span>Público-Alvo</span>
                    </div>
                    <p className="text-sm font-medium" data-testid="text-details-audience">
                      {selectedCampaign.targetAudience}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Dates */}
            {(selectedCampaign?.startDate || selectedCampaign?.endDate) && (
              <div className="grid grid-cols-2 gap-4">
                {selectedCampaign?.startDate && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      <span>Data de Início</span>
                    </div>
                    <p className="text-sm font-medium" data-testid="text-details-start-date">
                      {format(new Date(selectedCampaign.startDate), "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  </div>
                )}
                
                {selectedCampaign?.endDate && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      <span>Data de Término</span>
                    </div>
                    <p className="text-sm font-medium" data-testid="text-details-end-date">
                      {format(new Date(selectedCampaign.endDate), "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Template Info */}
            {selectedCampaign?.template && (
              <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FileText className="w-4 h-4 text-[#40E0D0]" />
                  <span>Template Base</span>
                </div>
                <p className="text-sm text-muted-foreground" data-testid="text-details-template">
                  {selectedCampaign.template.name}
                </p>
                {selectedCampaign.template.description && (
                  <p className="text-xs text-muted-foreground">
                    {selectedCampaign.template.description}
                  </p>
                )}
              </div>
            )}

            {/* Main Question */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <MessageSquare className="w-4 h-4 text-[#40E0D0]" />
                <span>Pergunta Principal</span>
              </div>
              <Card className="p-4">
                <p className="text-sm font-medium mb-2" data-testid="text-details-main-question">
                  {selectedCampaign?.customMainQuestion || selectedCampaign?.template?.questionText || "Pergunta não definida"}
                </p>
                <span className="text-xs text-muted-foreground">
                  {(() => {
                    const type = selectedCampaign?.customMainQuestionType || selectedCampaign?.template?.questionType;
                    switch(type) {
                      case 'open_text': return 'Resposta Aberta';
                      case 'single_choice': return 'Escolha Única';
                      case 'multiple_choice': return 'Múltipla Escolha';
                      default: return type || 'Tipo não definido';
                    }
                  })()}
                </span>
                
                {/* Show options for choice questions */}
                {(selectedCampaign?.customMainQuestionOptions?.length || selectedCampaign?.template?.options?.length) && (
                  <div className="mt-3 space-y-1">
                    <p className="text-xs text-muted-foreground">Opções de resposta:</p>
                    <div className="flex flex-wrap gap-1">
                      {(selectedCampaign?.customMainQuestionOptions || selectedCampaign?.template?.options || []).map((option, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {option}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            </div>

            {/* Custom Questions */}
            {selectedCampaign?.customQuestions && selectedCampaign.customQuestions.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <MessageSquare className="w-4 h-4 text-[#40E0D0]" />
                  <span>Perguntas Adicionais ({selectedCampaign.customQuestions.length})</span>
                </div>
                <div className="space-y-2">
                  {selectedCampaign.customQuestions.map((question, index) => (
                    <Card key={question.id} className="p-4" data-testid={`card-question-${index}`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-sm font-medium">
                          {index + 1}. {question.questionText}
                        </p>
                        {question.required && (
                          <Badge variant="destructive" className="text-xs flex-shrink-0">
                            Obrigatória
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {question.questionType === 'open_text' ? 'Resposta Aberta' :
                         question.questionType === 'single_choice' ? 'Escolha Única' : 'Múltipla Escolha'}
                      </span>
                      
                      {question.options && question.options.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <p className="text-xs text-muted-foreground">Opções:</p>
                          <div className="flex flex-wrap gap-1">
                            {question.options.map((opt, optIdx) => (
                              <Badge key={optIdx} variant="outline" className="text-xs">
                                {opt}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Admin Notes */}
            {selectedCampaign?.adminNotes && (
              <div className="space-y-2 p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <FileText className="w-4 h-4" />
                  <span>Notas do Administrador</span>
                </div>
                <p className="text-sm" data-testid="text-details-admin-notes">
                  {selectedCampaign.adminNotes}
                </p>
              </div>
            )}
          </div>

          {/* Fixed Footer */}
          <div className="flex-shrink-0 p-4 border-t bg-card">
            <div className="flex items-center gap-2">
              {selectedCampaign?.status === "approved" && (
                <>
                  <Button
                    onClick={() => {
                      if (selectedCampaign) handleCopyLink(selectedCampaign);
                    }}
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    data-testid="button-details-copy-link"
                  >
                    {copiedId === selectedCampaign?.id ? (
                      <>
                        <Check className="w-4 h-4 mr-2 text-[#40E0D0]" />
                        Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copiar Link
                      </>
                    )}
                  </Button>
                  {selectedCampaign?.user && (
                    <Button
                      onClick={() => {
                        if (selectedCampaign?.user) {
                          handleResetPasswordClick({ id: selectedCampaign.user.id, name: selectedCampaign.user.name });
                        }
                      }}
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      data-testid="button-details-reset-password"
                    >
                      <Key className="w-4 h-4 mr-2" />
                      Resetar Senha
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => setDetailsDialogOpen(false)}
                    size="sm"
                    className="flex-1"
                    data-testid="button-details-close"
                  >
                    Fechar
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Password Reset Dialog */}
      <Dialog open={passwordResetDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setPasswordResetDialogOpen(false);
          setUserToResetPassword(null);
          setResetPassword("");
          setConfirmResetPassword("");
        }
      }}>
        <DialogContent className="max-w-md" data-testid="dialog-reset-password-admin">
          <DialogHeader>
            <DialogTitle>Resetar Senha</DialogTitle>
            <DialogDescription>
              {userToResetPassword && (
                <>Alterar a senha de <strong>{userToResetPassword.name}</strong></>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Nova Senha</label>
              <Input
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                data-testid="input-reset-password-admin"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Confirmar Senha</label>
              <Input
                type="password"
                placeholder="Digite a senha novamente"
                value={confirmResetPassword}
                onChange={(e) => setConfirmResetPassword(e.target.value)}
                data-testid="input-confirm-reset-password-admin"
              />
            </div>
          </div>
          <DialogFooter className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setPasswordResetDialogOpen(false);
                setUserToResetPassword(null);
                setResetPassword("");
                setConfirmResetPassword("");
              }}
              data-testid="button-cancel-reset-password-admin"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleResetPasswordConfirm}
              disabled={resetPasswordMutation.isPending}
              data-testid="button-confirm-reset-password-admin"
            >
              {resetPasswordMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
