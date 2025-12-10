import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { X, Loader2, Vote, Users } from "lucide-react";
import logoUrl from "@assets/logo pol_1763308638963_1763559095972.png";

const BRAZILIAN_STATES = [
  "Acre", "Alagoas", "Amapá", "Amazonas", "Bahia", "Ceará", "Distrito Federal",
  "Espírito Santo", "Goiás", "Maranhão", "Mato Grosso", "Mato Grosso do Sul",
  "Minas Gerais", "Pará", "Paraíba", "Paraná", "Pernambuco", "Piauí",
  "Rio de Janeiro", "Rio Grande do Norte", "Rio Grande do Sul", "Rondônia",
  "Roraima", "Santa Catarina", "São Paulo", "Sergipe", "Tocantins"
];

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

interface CaboLandingData {
  candidate: {
    name: string;
    photo: string | null;
    party: {
      id: string;
      name: string;
      acronym: string;
      logoUrl: string | null;
    } | null;
    politicalPosition: string | null;
    electionNumber: string | null;
  };
  cabo: {
    name: string;
    photo: string | null;
    coverImage: string | null;
  };
}

const registrationSchema = z.object({
  name: z.string().min(2, "Nome é obrigatório"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  state: z.string().optional().or(z.literal("")),
});

type RegistrationFormData = z.infer<typeof registrationSchema>;

export default function CaboLanding() {
  const { adminSlug, caboSlug } = useParams<{ adminSlug: string; caboSlug: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const getPartyColor = (partyAcronym?: string | null) => {
    if (!partyAcronym) return "#40E0D0";
    return PARTY_COLORS[partyAcronym] || "#40E0D0";
  };

  const { data, isLoading, isError, error } = useQuery<CaboLandingData>({
    queryKey: ["/api/public/cabos", adminSlug, caboSlug],
    queryFn: async () => {
      const res = await fetch(`/api/public/cabos/${adminSlug}/${caboSlug}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("NOT_FOUND");
        }
        throw new Error("NETWORK_ERROR");
      }
      return res.json();
    },
    enabled: !!adminSlug && !!caboSlug,
    retry: 1,
  });

  const form = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      city: "",
      state: "",
    },
  });

  const capitalizeWords = (str: string) => {
    return str
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
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

  const submitMutation = useMutation({
    mutationFn: (formData: RegistrationFormData) => {
      return apiRequest("POST", `/api/public/cabos/${adminSlug}/${caboSlug}/register`, formData);
    },
    onSuccess: () => {
      toast({
        title: "Cadastro realizado!",
      });
      setLocation("/thank-you");
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao realizar cadastro",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (formData: RegistrationFormData) => {
    const processedData = {
      ...formData,
      name: capitalizeWords(formData.name),
      city: formData.city ? capitalizeWords(formData.city) : formData.city,
    };
    submitMutation.mutate(processedData);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#40E0D0]/20 to-background">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#40E0D0] mx-auto"></div>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    const errorMessage = error?.message || "NETWORK_ERROR";
    const isNotFound = errorMessage === "NOT_FOUND";

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#40E0D0]/20 to-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-destructive/10 rounded-full flex items-center justify-center">
              <X className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-2xl font-bold" data-testid="text-error-title">
              {isNotFound ? "Página não encontrada" : "Erro ao carregar"}
            </h2>
            <p className="text-muted-foreground" data-testid="text-error-description">
              {isNotFound
                ? "O link que você está tentando acessar não é válido ou foi removido."
                : "Não foi possível carregar as informações. Verifique sua conexão e tente novamente."
              }
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const partyColor = getPartyColor(data.candidate.party?.acronym);
  const partyColorLight = `${partyColor}20`;
  const backgroundImageUrl = data.cabo.coverImage;

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col">
      {backgroundImageUrl ? (
        <div
          className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${backgroundImageUrl})` }}
        ></div>
      ) : (
        <div
          className="fixed inset-0 z-0"
          style={{
            background: `linear-gradient(135deg, ${partyColor} 0%, ${partyColor}CC 50%, ${partyColor}99 100%)`,
          }}
        ></div>
      )}

      <div className="fixed inset-0 z-5 bg-gradient-to-b from-black/60 via-black/40 to-black/70"></div>

      <div className="relative z-20 min-h-screen flex flex-col">
        <div className="container mx-auto px-4 py-6 max-w-lg flex-1">
          
          <div className="relative mb-6">
            <div 
              className="relative overflow-hidden shadow-2xl"
              style={{
                borderRadius: '20px',
                minHeight: '420px',
              }}
            >
              <div 
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(160deg, ${partyColor} 0%, ${partyColor} 45%, #1a1a2e 45%, #1a1a2e 100%)`,
                }}
              ></div>
              
              <div 
                className="absolute left-0 top-0 bottom-0 flex items-center justify-center"
                style={{ width: '70%' }}
              >
                {data.candidate.photo ? (
                  <img 
                    src={data.candidate.photo} 
                    alt={data.candidate.name}
                    className="h-full w-full object-cover object-top"
                    style={{
                      maskImage: 'linear-gradient(to right, black 70%, transparent 100%)',
                      WebkitMaskImage: 'linear-gradient(to right, black 70%, transparent 100%)',
                    }}
                    data-testid="img-candidate"
                  />
                ) : (
                  <div 
                    className="w-32 h-32 rounded-full flex items-center justify-center bg-white/20 text-white text-5xl font-bold"
                  >
                    {data.candidate.name?.charAt(0)}
                  </div>
                )}
              </div>

              <div className="absolute bottom-0 left-0 right-0 z-10">
                <div 
                  className="p-4"
                  style={{
                    background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.8) 70%, transparent 100%)',
                  }}
                >
                  <div className="flex items-start gap-4 mb-4">
                    <div 
                      className="flex-shrink-0 px-4 py-3 rounded-xl text-center"
                      style={{ backgroundColor: partyColor }}
                    >
                      <div className="text-3xl md:text-4xl font-black text-white leading-none" data-testid="text-election-number">
                        {data.candidate.electionNumber || '00'}
                      </div>
                      {data.candidate.party && (
                        <div className="text-xs font-bold text-white/90 mt-1" data-testid="text-party">
                          {data.candidate.party.acronym}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h1 
                        className="text-xl md:text-2xl font-black text-white leading-tight"
                        data-testid="text-candidate-name"
                      >
                        {data.candidate.name}
                      </h1>
                      {data.candidate.politicalPosition && (
                        <p className="text-sm text-white/80 font-medium mt-0.5" data-testid="text-position">
                          {data.candidate.politicalPosition}
                        </p>
                      )}
                    </div>
                  </div>

                  <div 
                    className="relative rounded-xl overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${partyColor}15 0%, ${partyColor}30 100%)`,
                      border: `2px solid ${partyColor}50`,
                    }}
                  >
                    <div 
                      className="absolute top-0 left-0 px-3 py-1 text-[10px] font-bold text-white uppercase tracking-wider"
                      style={{ 
                        backgroundColor: partyColor,
                        borderBottomRightRadius: '8px',
                      }}
                    >
                      Apoiador Oficial
                    </div>
                    
                    <div className="flex items-center gap-4 p-4 pt-8">
                      <div 
                        className="flex-shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden border-3 shadow-xl"
                        style={{ borderColor: partyColor }}
                      >
                        {data.cabo.photo ? (
                          <img 
                            src={data.cabo.photo} 
                            alt={data.cabo.name}
                            className="w-full h-full object-cover"
                            data-testid="img-cabo"
                          />
                        ) : (
                          <div 
                            className="w-full h-full flex items-center justify-center text-white text-2xl font-bold"
                            style={{ backgroundColor: partyColor }}
                          >
                            {data.cabo.name?.charAt(0)}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-white/60 text-xs font-medium mb-0.5">
                          Indicação de
                        </p>
                        <h2 className="text-lg md:text-xl font-bold text-white leading-tight">
                          {data.cabo.name}
                        </h2>
                        <p className="text-white/70 text-sm mt-1">
                          Faça parte dessa mudança!
                        </p>
                      </div>
                      
                      <div className="flex-shrink-0">
                        <Users 
                          className="w-8 h-8 opacity-40"
                          style={{ color: partyColor }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Card className="shadow-2xl bg-white/95 backdrop-blur-md border-0 rounded-2xl overflow-hidden">
            <div 
              className="h-1"
              style={{ background: `linear-gradient(90deg, ${partyColor} 0%, ${partyColor}80 100%)` }}
            ></div>
            <CardContent className="p-6">
              <div className="text-center mb-5">
                <h2 className="text-xl font-bold text-gray-800" data-testid="text-form-title">
                  Faça parte dessa mudança!
                </h2>
                <p className="text-gray-500 text-sm mt-1">
                  Cadastre seu apoio e junte-se a nós
                </p>
              </div>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-700 font-medium">Nome completo *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Digite seu nome"
                            className="bg-gray-50 border-gray-200 focus:border-gray-400 rounded-lg h-11"
                            data-testid="input-name"
                          />
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
                        <FormLabel className="text-gray-700 font-medium">Email</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="email"
                            placeholder="seu@email.com"
                            className="bg-gray-50 border-gray-200 focus:border-gray-400 rounded-lg h-11"
                            data-testid="input-email"
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
                        <FormLabel className="text-gray-700 font-medium">WhatsApp</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="(00) 00000-0000"
                            className="bg-gray-50 border-gray-200 focus:border-gray-400 rounded-lg h-11"
                            onChange={(e) => {
                              const formatted = formatPhoneNumber(e.target.value);
                              field.onChange(formatted);
                            }}
                            maxLength={15}
                            data-testid="input-phone"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-700 font-medium">Cidade</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Sua cidade"
                              className="bg-gray-50 border-gray-200 focus:border-gray-400 rounded-lg h-11"
                              data-testid="input-city"
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
                          <FormLabel className="text-gray-700 font-medium">Estado</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-gray-50 border-gray-200 focus:border-gray-400 rounded-lg h-11" data-testid="select-state">
                                <SelectValue placeholder="UF" />
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
                  </div>

                  <Button
                    type="submit"
                    className="w-full text-white font-bold py-3 h-12 rounded-lg shadow-lg transition-all duration-200 hover:scale-[1.02] hover:shadow-xl"
                    style={{ backgroundColor: partyColor }}
                    disabled={submitMutation.isPending}
                    data-testid="button-submit"
                  >
                    {submitMutation.isPending ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Vote className="w-5 h-5 mr-2" />
                        Quero Apoiar!
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        <footer className="relative z-20 py-4 text-center text-white/80 text-sm">
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              <span>Powered by</span>
              <img src={logoUrl} alt="Politicall" className="h-5" data-testid="img-footer-logo" />
            </div>
            <a
              href="/privacy-policy"
              className="text-white/60 hover:text-white underline text-xs"
              data-testid="link-privacy-policy"
            >
              Política de Privacidade
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
