import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertLeadSchema, type InsertLead, POLITICAL_POSITIONS } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { isAuthenticated } from "@/lib/auth";
import { 
  Users, TrendingUp, ListTodo, Calendar, Bot, BarChart3, 
  CheckCircle2, Zap, Shield, Clock, Target, Award,
  ArrowRight, Star, MessageCircle
} from "lucide-react";
import { motion } from "framer-motion";
import logoUrl from "@assets/logo pol_1763308638963.png";

const BRAZILIAN_STATES = [
  "Acre", "Alagoas", "Amapá", "Amazonas", "Bahia", "Ceará", "Distrito Federal",
  "Espírito Santo", "Goiás", "Maranhão", "Mato Grosso", "Mato Grosso do Sul",
  "Minas Gerais", "Pará", "Paraíba", "Paraná", "Pernambuco", "Piauí",
  "Rio de Janeiro", "Rio Grande do Norte", "Rio Grande do Sul", "Rondônia",
  "Roraima", "Santa Catarina", "São Paulo", "Sergipe", "Tocantins"
];

const POSITION_OPTIONS = [
  { category: "Executivo Federal", positions: ["Presidente", "Vice-Presidente"] },
  { category: "Executivo Estadual", positions: ["Governador", "Vice-Governador"] },
  { category: "Executivo Municipal", positions: ["Prefeito", "Vice-Prefeito"] },
  { category: "Legislativo Federal", positions: ["Senador", "Deputado Federal"] },
  { category: "Legislativo Estadual", positions: ["Deputado Estadual"] },
  { category: "Legislativo Municipal", positions: ["Vereador"] },
  { category: "Candidatura", positions: ["Candidato", "Pré-Candidato"] },
  { category: "Outros", positions: ["Outro"] }
];

export default function LandingPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // SEO optimization & redirect authenticated users
  useEffect(() => {
    // Redirect if already authenticated
    if (isAuthenticated()) {
      setLocation("/dashboard");
      return;
    }

    // SEO optimization
    document.title = "Politicall - Plataforma Completa de Gestão Política | CRM, IA e Pesquisas";
    
    // Meta description
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', 'Gerencie sua carreira política com tecnologia de ponta. CRM de eleitores, IA para redes sociais, pesquisas TSE-compliant, gestão de demandas e muito mais em uma única plataforma profissional.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const form = useForm<InsertLead>({
    resolver: zodResolver(insertLeadSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      position: "",
      state: "",
      city: "",
      message: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertLead) => {
      return apiRequest("POST", "/api/leads", data);
    },
    onSuccess: () => {
      toast({
        title: "Solicitação enviada com sucesso!",
        description: "Nossa equipe entrará em contato em breve.",
      });
      form.reset();
    },
    onError: () => {
      toast({
        title: "Erro ao enviar solicitação",
        description: "Por favor, tente novamente.",
        variant: "destructive",
      });
    },
  });

  const fadeInUp = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5 }
  };

  const modules = [
    {
      icon: BarChart3,
      title: "Dashboard Inteligente",
      description: "Visualize todas as suas métricas políticas em tempo real. Acompanhe metas de campanha, intenção de voto e performance das suas ações.",
      color: "bg-primary"
    },
    {
      icon: Users,
      title: "CRM de Eleitores",
      description: "Gerencie todos os seus contatos de forma profissional. Organize eleitores, apoiadores e lideranças comunitárias em um só lugar.",
      color: "bg-blue-500"
    },
    {
      icon: TrendingUp,
      title: "Alianças Políticas",
      description: "Mapeie partidos, aliados e coligações. Visualize a ideologia dominante da sua base e fortaleça relações estratégicas.",
      color: "bg-purple-500"
    },
    {
      icon: ListTodo,
      title: "Gestão de Demandas",
      description: "Sistema completo de atendimento ao cidadão. Registre, priorize e resolva demandas com agilidade e transparência.",
      color: "bg-orange-500"
    },
    {
      icon: Calendar,
      title: "Agenda Política",
      description: "Nunca perca um compromisso. Calendário completo com eventos recorrentes, notificações automáticas e gestão de equipe.",
      color: "bg-green-500"
    },
    {
      icon: Bot,
      title: "Atendimento IA",
      description: "Robô inteligente powered by GPT-5 para responder DMs no Instagram, Facebook, Twitter e WhatsApp. Atendimento 24/7 automatizado.",
      color: "bg-indigo-500"
    },
    {
      icon: BarChart3,
      title: "Intenção Pública",
      description: "Crie pesquisas mercadológicas TSE-compliant com landing pages automáticas. Análise demográfica avançada e relatórios em PDF.",
      color: "bg-pink-500"
    }
  ];

  const benefits = [
    { icon: Zap, text: "Acelere sua campanha com automação inteligente" },
    { icon: Shield, text: "Dados seguros com backup automático" },
    { icon: Clock, text: "Economize horas de trabalho manual" },
    { icon: Target, text: "Tome decisões baseadas em dados reais" },
    { icon: Award, text: "Plataforma profissional e confiável" },
    { icon: CheckCircle2, text: "Suporte técnico especializado" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Dark gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-background z-0" />
        
        <div className="container mx-auto px-4 py-20 relative z-10">
          <motion.div
            className="text-center max-w-4xl mx-auto"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <img src={logoUrl} alt="Politicall" className="h-24 mx-auto mb-8" data-testid="img-logo-hero" />
            
            <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent" data-testid="text-hero-title">
              A Plataforma Completa para Políticos Vencedores
            </h1>
            
            <p className="text-xl md:text-2xl text-muted-foreground mb-8 leading-relaxed" data-testid="text-hero-subtitle">
              Gerencie sua carreira política com tecnologia de ponta. CRM, IA, pesquisas, agenda e muito mais em uma única plataforma profissional.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button
                size="lg"
                className="rounded-full text-lg px-8 py-6"
                onClick={() => document.getElementById('contato')?.scrollIntoView({ behavior: 'smooth' })}
                data-testid="button-cta-hero"
              >
                Quero Conhecer <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="rounded-full text-lg px-8 py-6"
                onClick={() => setLocation("/login")}
                data-testid="button-login-hero"
              >
                Já tenho conta
              </Button>
            </div>

            <div className="flex items-center justify-center gap-2 mt-8 text-sm text-muted-foreground" data-testid="social-proof-stars">
              <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
              <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
              <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
              <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
              <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
              <span className="ml-2" data-testid="text-social-proof">Confiado por políticos em todo o Brasil</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Modules Section */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <motion.div {...fadeInUp} className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Tudo que Você Precisa em Um Só Lugar</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Módulos integrados que trabalham juntos para impulsionar sua carreira política
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {modules.map((module, index) => {
              const Icon = module.icon;
              const testId = `card-module-${module.title.toLowerCase().replace(/\s+/g, '-')}`;
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className="h-full hover-elevate" data-testid={testId}>
                    <CardHeader>
                      <div className={`w-12 h-12 rounded-full ${module.color} flex items-center justify-center mb-4`}>
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <CardTitle className="text-xl" data-testid={`text-${testId}-title`}>{module.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="text-base" data-testid={`text-${testId}-description`}>{module.description}</CardDescription>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <motion.div {...fadeInUp} className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Por Que Escolher Politicall?</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Vantagens que fazem a diferença na sua gestão política
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {benefits.map((benefit, index) => {
              const Icon = benefit.icon;
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-start gap-4"
                  data-testid={`benefit-item-${index}`}
                >
                  <div className="bg-primary/10 p-3 rounded-full shrink-0">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <p className="text-lg" data-testid={`text-benefit-${index}`}>{benefit.text}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Contact Form Section */}
      <section id="contato" className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <motion.div {...fadeInUp} className="max-w-2xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-4xl md:text-5xl font-bold mb-4">Solicite uma Demonstração</h2>
              <p className="text-xl text-muted-foreground">
                Preencha o formulário e nossa equipe entrará em contato para apresentar a plataforma
              </p>
            </div>

            <Card>
              <CardContent className="p-8">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-6">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome Completo *</FormLabel>
                          <FormControl>
                            <Input placeholder="Seu nome" data-testid="input-lead-name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email *</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="seu@email.com" data-testid="input-lead-email" {...field} />
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
                            <FormLabel>Telefone *</FormLabel>
                            <FormControl>
                              <Input placeholder="(00) 00000-0000" data-testid="input-lead-phone" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="position"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cargo Político *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-lead-position">
                                <SelectValue placeholder="Selecione seu cargo" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {POSITION_OPTIONS.map((group) => (
                                <div key={group.category}>
                                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                    {group.category}
                                  </div>
                                  {group.positions.map((position) => (
                                    <SelectItem key={position} value={position}>
                                      {position}
                                    </SelectItem>
                                  ))}
                                </div>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="state"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Estado *</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-lead-state">
                                  <SelectValue placeholder="Selecione o estado" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {BRAZILIAN_STATES.map((state: string) => (
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
                            <FormLabel>Cidade *</FormLabel>
                            <FormControl>
                              <Input placeholder="Sua cidade" data-testid="input-lead-city" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="message"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mensagem (opcional)</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Conte-nos sobre suas necessidades..."
                              className="min-h-[100px]"
                              data-testid="textarea-lead-message"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      size="lg"
                      className="w-full rounded-full text-lg"
                      disabled={createMutation.isPending}
                      data-testid="button-submit-lead"
                    >
                      {createMutation.isPending ? "Enviando..." : "Solicitar Demonstração"}
                      <MessageCircle className="ml-2 w-5 h-5" />
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-muted/50 border-t">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src={logoUrl} alt="Politicall" className="h-8" />
              <span className="text-muted-foreground">&copy; 2025 Politicall. Todos os direitos reservados.</span>
            </div>
            <div className="flex gap-4">
              <Button variant="ghost" className="rounded-full" onClick={() => setLocation("/login")} data-testid="button-footer-login">
                Login
              </Button>
              <Button variant="ghost" className="rounded-full" onClick={() => setLocation("/register")} data-testid="button-footer-register">
                Criar Conta
              </Button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
