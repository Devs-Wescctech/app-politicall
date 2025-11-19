import { useState } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertContactSchema, type InsertContact, CONTACT_INTERESTS, CONTACT_SOURCES } from "@shared/schema";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, Heart, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import logoUrl from "@assets/logo pol_1763308638963_1763559095972.png";
import backgroundImage from "@assets/242_1763562569627.jpg";

const BRAZILIAN_STATES = [
  "Acre", "Alagoas", "Amapá", "Amazonas", "Bahia", "Ceará", "Distrito Federal",
  "Espírito Santo", "Goiás", "Maranhão", "Mato Grosso", "Mato Grosso do Sul",
  "Minas Gerais", "Pará", "Paraíba", "Paraná", "Pernambuco", "Piauí",
  "Rio de Janeiro", "Rio Grande do Norte", "Rio Grande do Sul", "Rondônia",
  "Roraima", "Santa Catarina", "São Paulo", "Sergipe", "Tocantins"
];

// Cores oficiais dos partidos políticos brasileiros
const PARTY_COLORS: Record<string, string> = {
  "PL": "#0047AB",       // Azul
  "PT": "#DA251D",       // Vermelho
  "PSDB": "#0080FF",     // Azul
  "PSB": "#FF8C00",      // Laranja
  "PDT": "#008000",      // Verde
  "MDB": "#008000",      // Verde
  "PP": "#0047AB",       // Azul
  "PSD": "#00A86B",      // Verde
  "PSOL": "#DA251D",     // Vermelho
  "PSC": "#00A86B",      // Verde
  "REPUBLICANOS": "#0047AB", // Azul
  "CIDADANIA": "#9B59B6",    // Roxo
  "AVANTE": "#FF6B35",       // Laranja
  "SOLIDARIEDADE": "#FF6B35", // Laranja
  "PODE": "#0047AB",         // Azul
  "PCdoB": "#DA251D",        // Vermelho
  "REDE": "#00A86B",         // Verde
  "PRTB": "#0047AB",         // Azul
  "DC": "#00A86B",           // Verde
  "PMB": "#008000",          // Verde
  "NOVO": "#FF8C00",         // Laranja
  "UP": "#DA251D",           // Vermelho
  "UNIÃO": "#0047AB",        // Azul
};

export default function PublicSupport() {
  const [, params] = useRoute("/apoio/:slug");
  const { toast } = useToast();
  const [isSubmitted, setIsSubmitted] = useState(false);
  
  // Obter cor do partido dinamicamente
  const getPartyColor = (partyAcronym?: string) => {
    if (!partyAcronym) return "#40E0D0"; // Cor padrão (turquoise)
    return PARTY_COLORS[partyAcronym] || "#40E0D0";
  };
  
  // Criar gradiente com base na cor do partido
  const getPartyGradient = (partyAcronym?: string) => {
    const baseColor = getPartyColor(partyAcronym);
    // Criar versões mais claras e escuras da cor
    return `linear-gradient(135deg, ${baseColor} 0%, ${baseColor}dd 50%, ${baseColor}bb 100%)`;
  };

  const { data: candidateData, isLoading: isLoadingCandidate, isError, error, refetch } = useQuery<any>({
    queryKey: ["/api/public/candidate", params?.slug],
    queryFn: async () => {
      const res = await fetch(`/api/public/candidate/${params?.slug}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("NOT_FOUND");
        }
        throw new Error("NETWORK_ERROR");
      }
      return res.json();
    },
    enabled: !!params?.slug,
    retry: 1,
  });

  const capitalizeWords = (str: string) => {
    return str
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const form = useForm<InsertContact>({
    resolver: zodResolver(insertContactSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      state: "",
      city: "",
      interests: [],
      source: "QR Code",
      notes: "",
    },
  });

  const submitMutation = useMutation({
    mutationFn: (data: InsertContact) => {
      if (!params?.slug) {
        throw new Error("Slug não encontrado");
      }
      return apiRequest("POST", `/api/public/support/${params.slug}`, data);
    },
    onSuccess: () => {
      setIsSubmitted(true);
      toast({ 
        title: "Cadastro realizado com sucesso!", 
        description: "Obrigado pelo seu apoio!" 
      });
      form.reset();
    },
    onError: (error: any) => {
      toast({ 
        title: "Erro ao realizar cadastro", 
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive" 
      });
    },
  });

  const handleSubmit = (data: InsertContact) => {
    const formattedData = {
      ...data,
      name: capitalizeWords(data.name),
      city: data.city ? capitalizeWords(data.city) : data.city,
    };
    submitMutation.mutate(formattedData);
  };

  if (isLoadingCandidate) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/10 to-background">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    const errorMessage = error?.message || "NETWORK_ERROR";
    const isNotFound = errorMessage === "NOT_FOUND";
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/10 to-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-destructive/10 rounded-full flex items-center justify-center">
              <X className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-2xl font-bold">
              {isNotFound ? "Página não encontrada" : "Erro ao carregar"}
            </h2>
            <p className="text-muted-foreground">
              {isNotFound 
                ? "O link que você está tentando acessar não é válido ou foi removido."
                : "Não foi possível carregar as informações do candidato. Verifique sua conexão e tente novamente."
              }
            </p>
            {!isNotFound && (
              <Button onClick={() => refetch()} data-testid="button-retry">
                Tentar Novamente
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!candidateData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/10 to-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-destructive/10 rounded-full flex items-center justify-center">
              <X className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-2xl font-bold">Carregando...</h2>
            <p className="text-muted-foreground">
              Aguarde enquanto carregamos as informações.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/10 to-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-6">
            <div className="w-20 h-20 mx-auto bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <Check className="w-10 h-10 text-green-600 dark:text-green-400" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Cadastro Confirmado!</h2>
              <p className="text-muted-foreground">
                Obrigado pelo seu apoio! Seus dados foram registrados com sucesso.
              </p>
            </div>
            {candidateData.avatar && (
              <div className="flex flex-col items-center gap-3 pt-4 border-t">
                <Avatar className="w-16 h-16">
                  <AvatarImage src={candidateData.avatar} alt={candidateData.name} />
                  <AvatarFallback>{candidateData.name?.charAt(0)}</AvatarFallback>
                </Avatar>
                <p className="text-sm text-muted-foreground">
                  Em breve entraremos em contato!
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background Image */}
      <div 
        className="fixed inset-0 w-full h-full bg-cover bg-center z-0"
        style={{ backgroundImage: `url(${backgroundImage})` }}
      ></div>
      
      {/* Dark Overlay for readability */}
      <div className="fixed inset-0 bg-black/60 z-10"></div>
      
      {/* Content */}
      <div className="relative z-20 min-h-screen">
        {/* Header */}
        <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b shadow-sm">
          <div className="container mx-auto px-4 py-4 flex items-center justify-center gap-4">
            {candidateData?.party && (
              <div className="flex items-center gap-3">
                <div 
                  className="w-3 h-3 rounded-full"
                  style={{ background: getPartyGradient(candidateData.party.acronym) }}
                ></div>
                <span 
                  className="text-lg font-bold bg-clip-text text-transparent"
                  style={{ backgroundImage: getPartyGradient(candidateData.party.acronym) }}
                >
                  {candidateData.party.acronym} - {candidateData.party.name}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Candidate Profile */}
        <div className="text-center space-y-6 mb-8 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md rounded-lg p-8 shadow-xl">
          <div className="flex flex-col items-center gap-4">
            <Avatar 
              className="w-32 h-32 shadow-lg ring-4 ring-white/50"
              style={{ 
                borderWidth: '4px',
                borderStyle: 'solid',
                borderImage: `${getPartyGradient(candidateData.party?.acronym)} 1`
              }}
            >
              <AvatarImage src={candidateData.avatar} alt={candidateData.name} />
              <AvatarFallback className="text-3xl">{candidateData.name?.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2">
                <div 
                  className="w-6 h-6"
                  style={{ 
                    WebkitMaskImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'currentColor\'%3E%3Cpath d=\'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z\'/%3E%3C/svg%3E")',
                    maskImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'currentColor\'%3E%3Cpath d=\'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z\'/%3E%3C/svg%3E")',
                    WebkitMaskRepeat: 'no-repeat',
                    maskRepeat: 'no-repeat',
                    WebkitMaskPosition: 'center',
                    maskPosition: 'center',
                    background: getPartyGradient(candidateData.party?.acronym)
                  }}
                />
                <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white">Eu Apoio</h1>
              </div>
              <h2 
                className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent"
                style={{ backgroundImage: getPartyGradient(candidateData.party?.acronym) }}
              >
                {candidateData.name}
              </h2>
              {candidateData.politicalPosition && (
                <p className="text-lg text-gray-700 dark:text-gray-300">
                  {candidateData.politicalPosition}
                </p>
              )}
            </div>
          </div>
          <p className="text-lg text-gray-700 dark:text-gray-300 max-w-xl mx-auto">
            Cadastre-se como apoiador e faça parte dessa mudança! 
            Juntos construiremos um futuro melhor.
          </p>
        </div>

        {/* Registration Form */}
        <Card className="shadow-xl bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-white/20">
          <CardContent className="p-6">
            <h3 className="text-xl font-bold mb-6 text-center">
              Cadastro de Apoiador
            </h3>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome Completo *</FormLabel>
                      <FormControl>
                        <Input placeholder="Seu nome completo" data-testid="input-support-name" {...field} />
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
                        <Input 
                          type="email" 
                          placeholder="seu.email@exemplo.com" 
                          data-testid="input-support-email" 
                          {...field} 
                          value={field.value || ""} 
                        />
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
                      <FormLabel>Telefone/WhatsApp</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="(00) 00000-0000" 
                          data-testid="input-support-phone" 
                          {...field} 
                          value={field.value || ""} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estado</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                          <FormControl>
                            <SelectTrigger data-testid="select-support-state">
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {BRAZILIAN_STATES.map((state) => (
                              <SelectItem key={state} value={state}>
                                {state}
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
                        <FormControl>
                          <Input
                            placeholder="Sua cidade"
                            data-testid="input-support-city"
                            value={field.value || ""}
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                            onChange={(e) => {
                              const formatted = capitalizeWords(e.target.value);
                              field.onChange(formatted);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="interests"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Interesses (opcional)</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              className="w-full justify-between font-normal"
                              data-testid="button-select-support-interests"
                            >
                              {field.value && field.value.length > 0
                                ? `${field.value.length} selecionado${field.value.length > 1 ? 's' : ''}`
                                : "Selecione seus interesses"}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Buscar interesses..." />
                            <CommandList>
                              <CommandEmpty>Nenhum interesse encontrado.</CommandEmpty>
                              <CommandGroup className="max-h-64 overflow-auto">
                                {CONTACT_INTERESTS.map((interest) => (
                                  <CommandItem
                                    key={interest}
                                    onSelect={() => {
                                      const currentValue = field.value || [];
                                      const newValue = currentValue.includes(interest)
                                        ? currentValue.filter((v) => v !== interest)
                                        : [...currentValue, interest];
                                      field.onChange(newValue);
                                    }}
                                  >
                                    <Check
                                      className={`mr-2 h-4 w-4 ${
                                        field.value?.includes(interest) ? "opacity-100" : "opacity-0"
                                      }`}
                                    />
                                    {interest}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      {field.value && field.value.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {field.value.map((interest) => (
                            <span
                              key={interest}
                              className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded-md"
                            >
                              {interest}
                              <button
                                type="button"
                                onClick={() => {
                                  const newValue = field.value?.filter((v) => v !== interest) || [];
                                  field.onChange(newValue);
                                }}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mensagem (opcional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Deixe uma mensagem de apoio..." 
                          data-testid="input-support-notes" 
                          {...field} 
                          value={field.value || ""} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button 
                  type="submit" 
                  className="w-full text-white border-0" 
                  size="lg"
                  disabled={submitMutation.isPending}
                  data-testid="button-submit-support"
                  style={{ 
                    background: getPartyGradient(candidateData.party?.acronym)
                  }}
                >
                  {submitMutation.isPending ? "Enviando..." : "Confirmar Apoio"}
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  Seus dados serão usados apenas para comunicação política e não serão compartilhados com terceiros.
                </p>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-white/80">
          <p>Plataforma Politicall - Gestão Política Inteligente</p>
        </div>
        </div>
      </div>
    </div>
  );
}
