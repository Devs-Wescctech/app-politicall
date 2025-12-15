import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Handshake, X, CheckCircle2, MapPin, Briefcase, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { POLITICAL_POSITIONS } from "@shared/schema";
import { z } from "zod";
import logoUrl from "@assets/logo pol_1763308638963_1763559095972.png";

const PARTY_COLORS: Record<string, string> = {
  "PL": "#0047AB",
  "PT": "#DA251D",
  "PSDB": "#0080FF",
  "PSB": "#FF8C00",
  "PDT": "#008000",
  "MDB": "#008000",
  "PP": "#0047AB",
  "PSD": "#00A86B",
  "PSOL": "#DA251D",
  "PSC": "#00A86B",
  "REPUBLICANOS": "#0047AB",
  "CIDADANIA": "#9B59B6",
  "AVANTE": "#FF6B35",
  "SOLIDARIEDADE": "#FF6B35",
  "PODE": "#0047AB",
  "PCdoB": "#DA251D",
  "REDE": "#00A86B",
  "PRTB": "#0047AB",
  "DC": "#00A86B",
  "PMB": "#008000",
  "NOVO": "#FF8C00",
  "UP": "#DA251D",
  "UNIÃO": "#0047AB",
};

const BRAZILIAN_STATES = [
  { value: "AC", label: "Acre" },
  { value: "AL", label: "Alagoas" },
  { value: "AP", label: "Amapá" },
  { value: "AM", label: "Amazonas" },
  { value: "BA", label: "Bahia" },
  { value: "CE", label: "Ceará" },
  { value: "DF", label: "Distrito Federal" },
  { value: "ES", label: "Espírito Santo" },
  { value: "GO", label: "Goiás" },
  { value: "MA", label: "Maranhão" },
  { value: "MT", label: "Mato Grosso" },
  { value: "MS", label: "Mato Grosso do Sul" },
  { value: "MG", label: "Minas Gerais" },
  { value: "PA", label: "Pará" },
  { value: "PB", label: "Paraíba" },
  { value: "PR", label: "Paraná" },
  { value: "PE", label: "Pernambuco" },
  { value: "PI", label: "Piauí" },
  { value: "RJ", label: "Rio de Janeiro" },
  { value: "RN", label: "Rio Grande do Norte" },
  { value: "RS", label: "Rio Grande do Sul" },
  { value: "RO", label: "Rondônia" },
  { value: "RR", label: "Roraima" },
  { value: "SC", label: "Santa Catarina" },
  { value: "SP", label: "São Paulo" },
  { value: "SE", label: "Sergipe" },
  { value: "TO", label: "Tocantins" },
];

const acceptInviteSchema = z.object({
  inviteeName: z.string().min(2, "Nome é obrigatório"),
  inviteeEmail: z.string().email("Email inválido").optional().or(z.literal("")),
  inviteePhone: z.string().min(10, "WhatsApp é obrigatório"),
  inviteePosition: z.string().optional(),
  inviteeState: z.string().optional(),
  inviteeCity: z.string().optional(),
  inviteeNotes: z.string().optional(),
});

type AcceptInviteForm = z.infer<typeof acceptInviteSchema>;

interface InviteData {
  invite: {
    id: string;
    status: string;
    inviteeEmail?: string;
    inviteePhone?: string;
    createdAt: string;
  };
  inviter: {
    name: string;
    avatar?: string;
    politicalPosition?: string;
    city?: string;
    state?: string;
  } | null;
  party: {
    id: string;
    name: string;
    acronym: string;
    ideology: string;
  } | null;
  account: {
    name: string;
  } | null;
  admin: {
    name: string;
    avatar?: string;
    politicalPosition?: string;
    city?: string;
    state?: string;
  } | null;
}

export default function AllianceInvitePage() {
  const [, params] = useRoute("/convite-alianca/:token");
  const { toast } = useToast();
  const [isAccepted, setIsAccepted] = useState(false);
  const [isRejected, setIsRejected] = useState(false);

  const getPartyColor = (partyAcronym?: string) => {
    if (!partyAcronym) return "#40E0D0";
    return PARTY_COLORS[partyAcronym] || "#40E0D0";
  };

  const formatPhoneNumber = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 2) {
      return `(${numbers}`;
    }
    if (numbers.length <= 7) {
      return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    }
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
  };

  const { data: inviteData, isLoading, isError, error } = useQuery<InviteData>({
    queryKey: ["/api/alliance-invites", params?.token, "public"],
    queryFn: async () => {
      const res = await fetch(`/api/alliance-invites/${params?.token}/public`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("NOT_FOUND");
        }
        if (res.status === 410) {
          const data = await res.json();
          throw new Error(data.error || "EXPIRED");
        }
        throw new Error("NETWORK_ERROR");
      }
      return res.json();
    },
    enabled: !!params?.token,
    retry: 1,
  });

  // Dynamic favicon and title based on admin data
  useEffect(() => {
    if (inviteData?.admin?.avatar) {
      const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (link) {
        link.href = inviteData.admin.avatar;
      } else {
        const newLink = document.createElement('link');
        newLink.rel = 'icon';
        newLink.href = inviteData.admin.avatar;
        document.head.appendChild(newLink);
      }
    }
    
    if (inviteData?.account?.name || inviteData?.admin?.name) {
      document.title = `Convite de Aliança - ${inviteData.account?.name || inviteData.admin?.name}`;
    }
  }, [inviteData?.admin?.avatar, inviteData?.account?.name, inviteData?.admin?.name]);

  const form = useForm<AcceptInviteForm>({
    resolver: zodResolver(acceptInviteSchema),
    defaultValues: {
      inviteeName: "",
      inviteeEmail: inviteData?.invite?.inviteeEmail || "",
      inviteePhone: inviteData?.invite?.inviteePhone || "",
      inviteePosition: "",
      inviteeState: "",
      inviteeCity: "",
      inviteeNotes: "",
    },
  });

  const acceptMutation = useMutation({
    mutationFn: (data: AcceptInviteForm) => {
      return apiRequest("POST", `/api/alliance-invites/${params?.token}/accept`, data);
    },
    onSuccess: () => {
      setIsAccepted(true);
      toast({
        title: "Aliança registrada com sucesso!",
        description: "Juntos somos mais fortes!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao aceitar convite",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => {
      return apiRequest("POST", `/api/alliance-invites/${params?.token}/reject`, {});
    },
    onSuccess: () => {
      setIsRejected(true);
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao rejeitar convite",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: AcceptInviteForm) => {
    acceptMutation.mutate(data);
  };

  const handleReject = () => {
    rejectMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/10 to-background">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" data-testid="loading-spinner"></div>
          <p className="text-muted-foreground" data-testid="text-loading">Carregando convite...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    const errorMessage = error?.message || "NETWORK_ERROR";
    const isNotFound = errorMessage === "NOT_FOUND";
    const isExpired = errorMessage.includes("expirado") || errorMessage === "EXPIRED";
    const isAlreadyAccepted = errorMessage.includes("aceito");

    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-primary/10 to-background">
        <header className="flex items-center justify-center p-4 border-b bg-background/80 backdrop-blur-sm">
          <img src={logoUrl} alt="Politicall" className="h-8" data-testid="img-logo" />
        </header>
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="max-w-md w-full" data-testid="card-error">
            <CardContent className="p-8 text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-destructive/10 rounded-full flex items-center justify-center">
                <X className="w-8 h-8 text-destructive" />
              </div>
              <h2 className="text-2xl font-bold" data-testid="text-error-title">
                {isNotFound ? "Convite não encontrado" : 
                 isExpired ? "Convite expirado" :
                 isAlreadyAccepted ? "Convite já aceito" : "Erro ao carregar"}
              </h2>
              <p className="text-muted-foreground" data-testid="text-error-message">
                {isNotFound 
                  ? "O link que você está tentando acessar não é válido ou foi removido."
                  : isExpired 
                    ? "Este convite de aliança já expirou. Entre em contato com o remetente para solicitar um novo convite."
                    : isAlreadyAccepted
                      ? "Este convite já foi aceito anteriormente."
                      : "Não foi possível carregar o convite. Verifique sua conexão e tente novamente."
                }
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isAccepted) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-primary/10 to-background">
        <header className="flex items-center justify-center p-4 border-b bg-background/80 backdrop-blur-sm">
          <img src={logoUrl} alt="Politicall" className="h-8" data-testid="img-logo" />
        </header>
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="max-w-md w-full" data-testid="card-success">
            <CardContent className="p-8 text-center space-y-6">
              <div className="w-20 h-20 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-primary" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-primary" data-testid="text-success-title">
                  Aliança Registrada!
                </h2>
                <p className="text-muted-foreground" data-testid="text-success-message">
                  Parabéns! Sua aliança foi registrada com sucesso. Juntos somos mais fortes!
                </p>
              </div>
              {inviteData?.inviter && (
                <div className="flex flex-col items-center gap-3 pt-4 border-t">
                  <Avatar className="w-16 h-16 ring-2 ring-primary/20">
                    <AvatarImage src={inviteData.inviter.avatar} alt={inviteData.inviter.name} />
                    <AvatarFallback className="text-xl">{inviteData.inviter.name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <p className="text-sm text-muted-foreground">
                    Você agora faz parte da aliança de <strong>{inviteData.inviter.name}</strong>
                  </p>
                </div>
              )}
              <div className="flex items-center justify-center gap-2 text-primary">
                <Handshake className="w-5 h-5" />
                <span className="font-medium">Unidos pelo futuro!</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isRejected) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-muted/30 to-background">
        <header className="flex items-center justify-center p-4 border-b bg-background/80 backdrop-blur-sm">
          <img src={logoUrl} alt="Politicall" className="h-8" data-testid="img-logo" />
        </header>
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="max-w-md w-full" data-testid="card-rejected">
            <CardContent className="p-8 text-center space-y-6">
              <div className="w-20 h-20 mx-auto bg-muted rounded-full flex items-center justify-center">
                <X className="w-10 h-10 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold" data-testid="text-rejected-title">
                  Convite Recusado
                </h2>
                <p className="text-muted-foreground" data-testid="text-rejected-message">
                  Você optou por não aceitar este convite de aliança. Obrigado pelo seu tempo.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-primary/10 to-background">
      <header className="flex items-center justify-center p-4 border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <img src={logoUrl} alt="Politicall" className="h-8" data-testid="img-logo" />
      </header>

      <main className="flex-1 container mx-auto px-4 py-8 max-w-lg">
        <Card className="shadow-lg" data-testid="card-invite">
          <CardHeader className="text-center pb-4">
            <div className="flex flex-col items-center gap-4">
              {inviteData?.inviter && (
                <Avatar 
                  className="w-24 h-24 ring-4 ring-white shadow-xl"
                  style={{ 
                    borderWidth: '3px',
                    borderStyle: 'solid',
                    borderColor: getPartyColor(inviteData.party?.acronym)
                  }}
                >
                  <AvatarImage 
                    src={inviteData.inviter.avatar} 
                    alt={inviteData.inviter.name} 
                    data-testid="img-inviter-avatar"
                  />
                  <AvatarFallback className="text-2xl bg-primary/10">
                    {inviteData.inviter.name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
              )}
              
              <div className="space-y-1">
                <CardTitle className="text-2xl" data-testid="text-inviter-name">
                  {inviteData?.inviter?.name || "Político"}
                </CardTitle>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
                {inviteData?.party && (
                  <div className="flex items-center gap-1" data-testid="badge-party">
                    <Building2 className="w-4 h-4" />
                    <span>{inviteData.party.acronym}</span>
                  </div>
                )}
                {inviteData?.inviter?.politicalPosition && (
                  <div className="flex items-center gap-1" data-testid="text-inviter-position">
                    <Briefcase className="w-4 h-4" />
                    <span>{inviteData.inviter.politicalPosition}</span>
                  </div>
                )}
                {(inviteData?.inviter?.city || inviteData?.inviter?.state) && (
                  <div className="flex items-center gap-1" data-testid="text-inviter-location">
                    <MapPin className="w-4 h-4" />
                    <span>
                      {[inviteData.inviter.city, inviteData.inviter.state].filter(Boolean).join(" - ")}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {inviteData?.account?.name && (
              <div className="text-center text-sm text-muted-foreground -mt-2 mb-4">
                <span className="font-medium">{inviteData.account.name}</span>
              </div>
            )}
            <div className="bg-primary/5 border border-primary/10 rounded-lg p-4 text-center">
              <div className="flex items-center justify-center gap-2 text-primary mb-2">
                <Handshake className="w-5 h-5" />
                <span className="font-semibold">Convite de Aliança Política</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-invite-message">
                Você foi convidado(a) para fazer parte da nossa aliança política
                {inviteData?.party && (
                  <> pelo partido <strong>{inviteData.party.acronym} - {inviteData.party.name}</strong></>
                )}. Preencha seus dados abaixo para aceitar o convite.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                Seus Dados
              </h3>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="inviteeName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome Completo *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Digite seu nome completo" 
                            {...field} 
                            data-testid="input-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="inviteeEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email *</FormLabel>
                        <FormControl>
                          <Input 
                            type="email"
                            placeholder="seu@email.com" 
                            {...field} 
                            data-testid="input-email"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="inviteePhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>WhatsApp *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="(00) 00000-0000" 
                            {...field}
                            onChange={(e) => {
                              const formatted = formatPhoneNumber(e.target.value);
                              field.onChange(formatted);
                            }}
                            data-testid="input-whatsapp"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="inviteePosition"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cargo Político (opcional)</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-position">
                              <SelectValue placeholder="Selecione seu cargo" />
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

                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="inviteeState"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Estado (opcional)</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-state">
                                <SelectValue placeholder="UF" />
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
                      name="inviteeCity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cidade (opcional)</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Sua cidade" 
                              {...field} 
                              data-testid="input-city"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="inviteeNotes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Observações (opcional)</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Informações adicionais..." 
                            {...field} 
                            rows={3}
                            data-testid="textarea-notes"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {inviteData?.party && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Partido</label>
                      <Input 
                        value={`${inviteData.party.name} (${inviteData.party.acronym})`}
                        disabled
                        className="bg-muted"
                        data-testid="input-party-disabled"
                      />
                      <p className="text-xs text-muted-foreground">
                        Este é o partido associado ao convite
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3 mt-6">
                    <Button 
                      type="button"
                      variant="outline" 
                      size="lg"
                      className="flex-1"
                      onClick={handleReject}
                      disabled={rejectMutation.isPending}
                      data-testid="button-reject-alliance"
                    >
                      {rejectMutation.isPending ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                          Processando...
                        </>
                      ) : (
                        <>
                          <X className="w-5 h-5 mr-2" />
                          Rejeitar
                        </>
                      )}
                    </Button>
                    <Button 
                      type="submit" 
                      size="lg"
                      className="flex-1"
                      disabled={acceptMutation.isPending}
                      data-testid="button-accept-alliance"
                    >
                      {acceptMutation.isPending ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Processando...
                        </>
                      ) : (
                        <>
                          <Handshake className="w-5 h-5 mr-2" />
                          Aceitar Aliança
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          </CardContent>
        </Card>
      </main>

      <footer className="text-center py-4 text-xs text-muted-foreground border-t bg-background/80">
        <p>Powered by Politicall &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
