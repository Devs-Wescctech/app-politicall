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
import { X, Loader2 } from "lucide-react";
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
    avatar: string | null;
    partyName: string | null;
    partyAcronym: string | null;
  };
  cabo: {
    name: string;
    avatarUrl: string | null;
    coverImageUrl: string | null;
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
        title: "Cadastro realizado com sucesso!",
        description: "Obrigado pelo seu apoio!",
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

  const partyColor = getPartyColor(data.candidate.partyAcronym);
  const backgroundImageUrl = data.cabo.coverImageUrl;

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

      <div className="fixed inset-0 z-5 bg-black/50"></div>

      <div
        className="relative z-20 min-h-screen flex flex-col"
        style={{
          '--background': '0 0% 100%',
          '--foreground': '240 10% 3.9%',
          '--card': '0 0% 100%',
          '--card-foreground': '240 10% 3.9%',
          '--popover': '0 0% 100%',
          '--popover-foreground': '240 10% 3.9%',
          '--primary': '240 5.9% 10%',
          '--primary-foreground': '0 0% 98%',
          '--secondary': '240 4.8% 95.9%',
          '--secondary-foreground': '240 5.9% 10%',
          '--muted': '240 4.8% 95.9%',
          '--muted-foreground': '240 3.8% 46.1%',
          '--accent': '240 4.8% 95.9%',
          '--accent-foreground': '240 5.9% 10%',
          '--destructive': '0 84.2% 60.2%',
          '--destructive-foreground': '0 0% 98%',
          '--border': '240 5.9% 90%',
          '--input': '240 5.9% 90%',
          '--ring': '240 5.9% 10%',
        } as React.CSSProperties}
      >
        <div className="container mx-auto px-4 py-8 max-w-lg flex-1">
          <div className="text-center space-y-6 mb-6 bg-white/95 backdrop-blur-md rounded-lg p-6 shadow-xl">
            <div className="flex items-center justify-center gap-4">
              <Avatar
                className="w-20 h-20 shadow-lg ring-4 ring-white/70"
                style={{
                  borderWidth: '3px',
                  borderStyle: 'solid',
                  borderColor: partyColor,
                }}
              >
                <AvatarImage src={data.candidate.avatar || undefined} alt={data.candidate.name} />
                <AvatarFallback className="text-2xl bg-gray-200">
                  {data.candidate.name?.charAt(0)}
                </AvatarFallback>
              </Avatar>

              {data.cabo.avatarUrl && (
                <Avatar className="w-14 h-14 shadow-lg ring-2 ring-white/70">
                  <AvatarImage src={data.cabo.avatarUrl} alt={data.cabo.name} />
                  <AvatarFallback className="text-lg bg-gray-200">
                    {data.cabo.name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
              )}
            </div>

            <div className="space-y-2">
              <h1
                className="text-2xl md:text-3xl font-bold"
                style={{ color: partyColor }}
                data-testid="text-title"
              >
                Apoie {data.candidate.name}
              </h1>
              <p className="text-gray-600 text-sm" data-testid="text-subtitle">
                Indicado por <span className="font-semibold">{data.cabo.name}</span>
              </p>
              {data.candidate.partyName && (
                <p
                  className="text-xs font-medium px-3 py-1 rounded-full inline-block"
                  style={{ backgroundColor: `${partyColor}20`, color: partyColor }}
                  data-testid="text-party"
                >
                  {data.candidate.partyAcronym} - {data.candidate.partyName}
                </p>
              )}
            </div>
          </div>

          <Card className="shadow-xl bg-white/95 backdrop-blur-md">
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-4 text-gray-800" data-testid="text-form-title">
                Cadastre seu apoio
              </h2>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-700">Nome *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Seu nome completo"
                            className="bg-white"
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
                        <FormLabel className="text-gray-700">Email</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="email"
                            placeholder="seu@email.com"
                            className="bg-white"
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
                        <FormLabel className="text-gray-700">Telefone</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="(00) 00000-0000"
                            className="bg-white"
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

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-700">Cidade</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Sua cidade"
                              className="bg-white"
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
                          <FormLabel className="text-gray-700">Estado</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-white" data-testid="select-state">
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
                  </div>

                  <Button
                    type="submit"
                    className="w-full text-white font-semibold py-3"
                    style={{ backgroundColor: partyColor }}
                    disabled={submitMutation.isPending}
                    data-testid="button-submit"
                  >
                    {submitMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      "Registrar Apoio"
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
