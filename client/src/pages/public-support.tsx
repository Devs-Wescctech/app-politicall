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

const BRAZILIAN_STATES = [
  "Acre", "Alagoas", "Amapá", "Amazonas", "Bahia", "Ceará", "Distrito Federal",
  "Espírito Santo", "Goiás", "Maranhão", "Mato Grosso", "Mato Grosso do Sul",
  "Minas Gerais", "Pará", "Paraíba", "Paraná", "Pernambuco", "Piauí",
  "Rio de Janeiro", "Rio Grande do Norte", "Rio Grande do Sul", "Rondônia",
  "Roraima", "Santa Catarina", "São Paulo", "Sergipe", "Tocantins"
];

export default function PublicSupport() {
  const [, params] = useRoute("/apoio/:slug");
  const { toast } = useToast();
  const [isSubmitted, setIsSubmitted] = useState(false);

  const { data: candidateData, isLoading: isLoadingCandidate } = useQuery<any>({
    queryKey: ["/api/public/candidate", params?.slug],
    enabled: !!params?.slug,
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
    mutationFn: (data: InsertContact) =>
      apiRequest("POST", `/api/public/support/${params?.slug}`, data),
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

  if (!candidateData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary/10 to-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-destructive/10 rounded-full flex items-center justify-center">
              <X className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-2xl font-bold">Página não encontrada</h2>
            <p className="text-muted-foreground">
              O link que você está tentando acessar não é válido ou foi removido.
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
    <div className="min-h-screen bg-gradient-to-b from-primary/10 to-background">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <img src={logoUrl} alt="Politicall" className="h-12 mx-auto" />
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Candidate Profile */}
        <div className="text-center space-y-6 mb-8">
          <div className="flex flex-col items-center gap-4">
            <Avatar className="w-32 h-32 border-4 border-primary shadow-lg">
              <AvatarImage src={candidateData.avatar} alt={candidateData.name} />
              <AvatarFallback className="text-3xl">{candidateData.name?.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2">
                <Heart className="w-6 h-6 text-primary fill-primary" />
                <h1 className="text-3xl md:text-4xl font-bold">Eu Apoio</h1>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-primary">
                {candidateData.name}
              </h2>
              {candidateData.politicalPosition && (
                <p className="text-lg text-muted-foreground">
                  {candidateData.politicalPosition}
                </p>
              )}
              {candidateData.party && (
                <div className="inline-block px-4 py-1.5 bg-primary/10 rounded-full">
                  <p className="font-semibold text-primary">
                    {candidateData.party.acronym} - {candidateData.party.name}
                  </p>
                </div>
              )}
            </div>
          </div>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Cadastre-se como apoiador e faça parte dessa mudança! 
            Juntos construiremos um futuro melhor.
          </p>
        </div>

        {/* Registration Form */}
        <Card className="shadow-lg">
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
                  className="w-full" 
                  size="lg"
                  disabled={submitMutation.isPending}
                  data-testid="button-submit-support"
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
        <div className="text-center mt-8 text-sm text-muted-foreground">
          <p>Plataforma Politicall - Gestão Política Inteligente</p>
        </div>
      </div>
    </div>
  );
}
