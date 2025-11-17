import { useEffect, useState, useRef } from "react";
import { useInView } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertLeadSchema, type InsertLead, POLITICAL_POSITIONS } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { isAuthenticated } from "@/lib/auth";
import { 
  Users, TrendingUp, ListTodo, Calendar, Bot, BarChart3, 
  CheckCircle2, Zap, Shield, Clock, Target, Award,
  ArrowRight, Menu, X, ChevronRight, Sparkles, MessageSquare,
  BarChart2, FileText, Network, Brain
} from "lucide-react";
import { motion, useScroll, useTransform } from "framer-motion";
import logoUrl from "@assets/logo pol_1763308638963.png";
import heroBackgroundVideo from "@assets/grok-video-d39a8f83-9488-4450-a920-1ca2b1507b3e (1)_1763410752455.mp4";
import crmImage from "@assets/Técnico- Luis Flores (4)_1763413287476.png";
import alliancesImage from "@assets/Técnico- Luis Flores (5)_1763413674690.png";
import demandsImage from "@assets/Técnico- Luis Flores (6)_1763413913827.png";
import eventsImage from "@assets/Técnico- Luis Flores (7)_1763414009496.png";
import aiImage from "@assets/dsfsdfdsfdsfdsf_1763412976580.png";
import marketingImage from "@assets/stock_images/marketing_campaign_a_481dcd3f.jpg";

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

function AnimatedNumber({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;
    
    const duration = 2000;
    const steps = 60;
    const increment = value / steps;
    const stepDuration = duration / steps;
    
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setCount(value);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, stepDuration);
    
    return () => clearInterval(timer);
  }, [value, isInView]);

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1).replace('.0', '') + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(0) + 'mil';
    }
    return num.toString();
  };

  return (
    <div ref={ref} className="text-4xl font-bold text-primary">
      {formatNumber(count)}{suffix}
    </div>
  );
}

export default function LandingPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { scrollY } = useScroll();
  const headerBg = useTransform(scrollY, [0, 100], ["rgba(255, 255, 255, 0)", "rgba(255, 255, 255, 0.95)"]);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (isAuthenticated()) {
      setLocation("/dashboard");
      return;
    }

    document.title = "Politicall - Plataforma Completa de Gestão Política | CRM, IA e Pesquisas";
    
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', 'Gerencie sua carreira política com tecnologia de ponta. CRM inteligente para o gabinete, IA para redes sociais, pesquisas TSE-compliant, gestão de demandas e muito mais em uma única plataforma profissional.');
    }

    if (videoRef.current) {
      videoRef.current.playbackRate = 0.75;
    }

    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
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

  const leadMutation = useMutation({
    mutationFn: async (data: InsertLead) => {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to submit");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Mensagem enviada com sucesso!",
        description: "Entraremos em contato em breve.",
      });
      form.reset();
    },
    onError: () => {
      toast({
        title: "Erro ao enviar mensagem",
        description: "Tente novamente mais tarde.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertLead) => {
    leadMutation.mutate(data);
  };

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setMobileMenuOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <motion.header 
        className="fixed top-0 left-0 right-0 z-50 border-b"
        style={{ backgroundColor: headerBg }}
      >
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img src={logoUrl} alt="Politicall" className="h-8" data-testid="img-header-logo" />
            </div>

            <nav className="hidden md:flex items-center gap-6">
              <button onClick={() => scrollToSection('recursos')} className={`text-sm hover:text-primary transition-colors ${!isScrolled ? 'text-white' : ''}`} data-testid="button-nav-recursos">
                Recursos
              </button>
              <button onClick={() => scrollToSection('ia')} className={`text-sm hover:text-primary transition-colors ${!isScrolled ? 'text-white' : ''}`} data-testid="button-nav-ia">
                IA para Redes Sociais
              </button>
              <button onClick={() => scrollToSection('modulos')} className={`text-sm hover:text-primary transition-colors ${!isScrolled ? 'text-white' : ''}`} data-testid="button-nav-modulos">
                Módulos
              </button>
              <button onClick={() => scrollToSection('contato')} className={`text-sm hover:text-primary transition-colors ${!isScrolled ? 'text-white' : ''}`} data-testid="button-nav-contato">
                Contato
              </button>
              <Button size="sm" className="rounded-full w-32" onClick={() => setLocation("/login")} data-testid="button-header-login">
                Login
              </Button>
              <Button variant="outline" size="sm" className={`rounded-full w-32 ${!isScrolled ? 'text-white !border-white hover:bg-white/10' : 'border-primary text-primary'}`} onClick={() => scrollToSection('contato')} data-testid="button-header-cta">
                Começar Agora
              </Button>
            </nav>

            <button 
              className={`md:hidden p-2 ${!isScrolled ? 'text-white' : ''}`}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              data-testid="button-mobile-menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {mobileMenuOpen && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="md:hidden py-4 border-t bg-background"
              data-testid="mobile-menu"
            >
              <nav className="flex flex-col gap-4">
                <button onClick={() => scrollToSection('recursos')} className="text-left px-4 py-2 hover:bg-muted rounded-md" data-testid="button-mobile-recursos">
                  Recursos
                </button>
                <button onClick={() => scrollToSection('ia')} className="text-left px-4 py-2 hover:bg-muted rounded-md" data-testid="button-mobile-ia">
                  IA para Redes Sociais
                </button>
                <button onClick={() => scrollToSection('modulos')} className="text-left px-4 py-2 hover:bg-muted rounded-md" data-testid="button-mobile-modulos">
                  Módulos
                </button>
                <button onClick={() => scrollToSection('contato')} className="text-left px-4 py-2 hover:bg-muted rounded-md" data-testid="button-mobile-contato">
                  Contato
                </button>
                <div className="px-4 flex flex-col gap-2">
                  <Button variant="outline" className="rounded-full w-full" onClick={() => setLocation("/login")} data-testid="button-mobile-login">
                    Login
                  </Button>
                  <Button className="rounded-full w-full" onClick={() => scrollToSection('contato')} data-testid="button-mobile-cta">
                    Começar Agora
                  </Button>
                </div>
              </nav>
            </motion.div>
          )}
        </div>
      </motion.header>

      <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden">
        <video 
          ref={videoRef}
          autoPlay 
          loop 
          muted 
          playsInline
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ willChange: 'transform' }}
        >
          <source src={heroBackgroundVideo} type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/60 to-black/70" />
        
        <div className="container mx-auto px-4 py-32 relative z-10">
          <motion.div
            className="max-w-4xl mx-auto text-center"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight text-white" data-testid="text-hero-title">
              Transforme Sua Carreira Política com
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent"> Tecnologia de Ponta</span>
            </h1>
            
            <p className="text-xl md:text-2xl text-white/90 mb-12 leading-relaxed max-w-3xl mx-auto" data-testid="text-hero-subtitle">
              CRM inteligente para o gabinete, IA que responde automaticamente suas redes sociais, pesquisas TSE-compliant, gestão de demandas e muito mais. Tudo em uma única plataforma profissional.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-3xl mx-auto">
              <div className="flex flex-col items-center gap-2" data-testid="stat-users">
                <AnimatedNumber value={500} suffix="+" />
                <div className="text-sm text-white/80">Políticos Ativos</div>
              </div>
              <div className="flex flex-col items-center gap-2" data-testid="stat-contacts">
                <AnimatedNumber value={50000} suffix="+" />
                <div className="text-sm text-white/80">Eleitores Cadastrados</div>
              </div>
              <div className="flex flex-col items-center gap-2" data-testid="stat-responses">
                <AnimatedNumber value={1000000} suffix="+" />
                <div className="text-sm text-white/80">Respostas Automáticas IA</div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section id="recursos" className="py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4" data-testid="text-benefits-title">Por Que Politicall?</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              A solução completa que políticos profissionais escolhem para vencer
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <Card className="border-0 shadow-lg" data-testid="card-benefit-0">
              <CardContent className="p-8">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-primary/10">
                    <Zap className="w-6 h-6 text-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-2">Economia de Tempo Brutal</h3>
                    <p className="text-muted-foreground">
                      Automatize 80% das tarefas repetitivas e foque no que realmente importa: conectar-se com seus eleitores.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg" data-testid="card-benefit-1">
              <CardContent className="p-8">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-primary/10">
                    <Brain className="w-6 h-6 text-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-2">IA Avançada</h3>
                    <p className="text-muted-foreground">
                      Inteligência artificial responde suas mensagens 24/7 nas redes sociais com o seu tom de voz.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg" data-testid="card-benefit-2">
              <CardContent className="p-8">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-primary/10">
                    <Shield className="w-6 h-6 text-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-2">100% Compliance TSE</h3>
                    <p className="text-muted-foreground">
                      Todas as pesquisas e processos seguem rigorosamente as normas do Tribunal Superior Eleitoral.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg" data-testid="card-benefit-3">
              <CardContent className="p-8">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-primary/10">
                    <BarChart2 className="w-6 h-6 text-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-2">Dashboards Inteligentes</h3>
                    <p className="text-muted-foreground">
                      Visualize suas métricas em tempo real e tome decisões baseadas em dados concretos.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg" data-testid="card-benefit-4">
              <CardContent className="p-8">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-primary/10">
                    <Network className="w-6 h-6 text-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-2">Gestão de Alianças</h3>
                    <p className="text-muted-foreground">
                      Mapeie e fortaleça suas alianças políticas com visão estratégica completa.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg" data-testid="card-benefit-5">
              <CardContent className="p-8">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-primary/10">
                    <Target className="w-6 h-6 text-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-2">Metas e Acompanhamento</h3>
                    <p className="text-muted-foreground">
                      Defina metas automáticas baseadas em eleições anteriores e acompanhe o progresso em tempo real.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section id="ia" className="py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6" data-testid="badge-ai-section">
                  <Bot className="w-4 h-4" />
                  <span className="text-sm font-medium">Inteligência Artificial</span>
                </div>
                
                <h2 className="text-4xl md:text-5xl font-bold mb-6" data-testid="text-ai-title">
                  IA que Responde Suas Redes Sociais 24/7
                </h2>
                
                <p className="text-lg text-muted-foreground mb-8">
                  Nossa inteligência artificial foi treinada especificamente para o contexto político brasileiro. Ela aprende o seu tom de voz, suas posições e responde automaticamente mensagens em Facebook, Instagram, Twitter e WhatsApp.
                </p>

                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">Respostas Personalizadas</h3>
                      <p className="text-muted-foreground text-sm">
                        A IA analisa o contexto de cada mensagem e responde de forma personalizada, mantendo seu tom de voz único.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">Moderação Inteligente</h3>
                      <p className="text-muted-foreground text-sm">
                        Filtra automaticamente comentários ofensivos, spam e mensagens irrelevantes, mantendo suas redes limpas.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">Análise de Sentimento</h3>
                      <p className="text-muted-foreground text-sm">
                        Monitora o sentimento das interações e alerta sobre tendências positivas ou negativas em tempo real.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">Escalamento Inteligente</h3>
                      <p className="text-muted-foreground text-sm">
                        Identifica questões complexas e encaminha automaticamente para sua equipe quando necessário.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">Relatórios Detalhados</h3>
                      <p className="text-muted-foreground text-sm">
                        Acompanhe métricas de engajamento, temas mais discutidos e oportunidades de conexão.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <img 
                src={aiImage} 
                alt="IA Politicall respondendo mensagens automaticamente" 
                className="w-full h-auto"
                data-testid="img-ai-screenshot"
              />
            </div>
          </div>
        </div>
      </section>

      <section id="modulos" className="py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4" data-testid="text-modules-title">Módulos Integrados</h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Tudo que você precisa para gerenciar sua carreira política de forma profissional
            </p>
          </div>

          <div className="space-y-24 max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <img 
                src={crmImage} 
                alt="CRM de Gabinete Politicall" 
                className="w-full h-auto order-2 lg:order-1"
                data-testid="img-module-crm"
              />
              <div className="order-1 lg:order-2">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-lg bg-primary/10">
                    <ListTodo className="w-8 h-8 text-foreground" />
                  </div>
                  <h3 className="text-3xl font-bold">Gestão de Demandas</h3>
                </div>
                <p className="text-lg text-muted-foreground mb-6">
                  Organize todas as solicitações dos eleitores. Atribua responsáveis, defina prazos, acompanhe o status e mantenha a população informada.
                </p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span>Sistema de priorização automática (Normal, Alta, Urgente, Crítica)</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span>Atribuição de demandas para membros da equipe</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span>Comentários internos e atualizações em tempo real</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span>Notificações automáticas para demandas urgentes</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span>Relatórios de produtividade e tempo médio de resolução</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-lg bg-primary/10">
                    <TrendingUp className="w-8 h-8 text-foreground" />
                  </div>
                  <h3 className="text-3xl font-bold">Alianças Políticas</h3>
                </div>
                <p className="text-lg text-muted-foreground mb-6">
                  Mapeie e gerencie suas alianças políticas. Acompanhe partidos aliados, visualize a rede de apoio e fortaleça relacionamentos estratégicos.
                </p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span>Cadastro completo de partidos e políticos aliados</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span>Visualização geográfica das alianças por estado e cidade</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span>Metas automáticas de alianças com base em histórico</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span>Contato direto via e-mail e WhatsApp integrados</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span>Análise de força política e influência regional</span>
                  </li>
                </ul>
              </div>
              <img 
                src={alliancesImage} 
                alt="Gestão de Alianças Políticas Politicall" 
                className="w-full h-auto"
                data-testid="img-module-alliances"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <img 
                src={demandsImage} 
                alt="Pesquisas Eleitorais TSE-Compliant Politicall" 
                className="w-full h-auto order-2 lg:order-1"
                data-testid="img-module-demands"
              />
              <div className="order-1 lg:order-2">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-lg bg-primary/10">
                    <FileText className="w-8 h-8 text-foreground" />
                  </div>
                  <h3 className="text-3xl font-bold">Pesquisas Eleitorais TSE-Compliant</h3>
                </div>
                <p className="text-lg text-muted-foreground mb-6">
                  Crie e gerencie pesquisas eleitorais profissionais com total conformidade legal. Landing pages automáticas, coleta de dados demográficos e análise em tempo real.
                </p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span>Templates pré-aprovados seguindo normas do TSE</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span>Landing pages públicas geradas automaticamente</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span>Coleta completa de dados demográficos dos respondentes</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span>Workflow de aprovação administrativa obrigatório</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span>Relatórios PDF executivos com gráficos profissionais</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-lg bg-primary/10">
                    <Calendar className="w-8 h-8 text-foreground" />
                  </div>
                  <h3 className="text-3xl font-bold">Agenda Inteligente</h3>
                </div>
                <p className="text-lg text-muted-foreground mb-6">
                  Gerencie sua agenda política com eventos recorrentes, notificações e visão mensal. Nunca mais perca um compromisso importante.
                </p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span>Eventos recorrentes (diários, semanais, mensais)</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span>Notificações automáticas de eventos próximos</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span>Categorização por tipo (reunião, evento público, visita, etc)</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span>Sincronização com calendários externos (Google, Outlook)</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span>Visualização mensal, semanal e diária</span>
                  </li>
                </ul>
              </div>
              <img 
                src={eventsImage} 
                alt="Agenda de Eventos Politicall" 
                className="w-full h-auto"
                data-testid="img-module-events"
              />
            </div>

          </div>
        </div>
      </section>

      <section className="py-32 bg-gradient-to-br from-primary/5 via-background to-background">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6">
                <Zap className="w-4 h-4" />
                <span className="text-sm font-medium">Pesquisas Impulsionadas</span>
              </div>
              <h2 className="text-4xl md:text-6xl font-bold mb-6" data-testid="text-ads-title">
                Pesquisas Eleitorais Turbinadas com Google Ads
              </h2>
              <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                Pare de depender de pesquisas caras e lentas. Use tecnologia a seu favor: impulsione suas pesquisas no Google Ads e colete dados cirúrgicos dos eleitores que realmente importam para sua eleição.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
              <Card className="border-0 shadow-xl bg-card">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                    <Target className="w-8 h-8 text-primary" />
                  </div>
                  <div className="text-4xl font-bold mb-3">72h</div>
                  <div className="text-lg font-semibold mb-2">Para 10 Mil Respostas</div>
                  <p className="text-muted-foreground text-sm">
                    Coleta massiva e rápida de dados que levaria meses em pesquisas tradicionais
                  </p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-xl bg-card">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                    <Users className="w-8 h-8 text-primary" />
                  </div>
                  <div className="text-4xl font-bold mb-3">100%</div>
                  <div className="text-lg font-semibold mb-2">Segmentação Precisa</div>
                  <p className="text-muted-foreground text-sm">
                    Alcance exatamente o perfil demográfico que você precisa para vencer
                  </p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-xl bg-card">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                    <BarChart2 className="w-8 h-8 text-primary" />
                  </div>
                  <div className="text-4xl font-bold mb-3">95%</div>
                  <div className="text-lg font-semibold mb-2">Mais Barato</div>
                  <p className="text-muted-foreground text-sm">
                    Economia brutal comparado a pesquisas tradicionais por telefone ou presenciais
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="bg-card rounded-2xl p-8 md:p-12 shadow-2xl border">
              <h3 className="text-3xl font-bold mb-8 text-center">Por Que Usar Google Ads Para Suas Pesquisas Eleitorais</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-primary/10 shrink-0">
                      <CheckCircle2 className="w-6 h-6 text-foreground" />
                    </div>
                    <div>
                      <h4 className="font-bold text-lg mb-2">Segmentação Cirúrgica de Eleitores</h4>
                      <p className="text-muted-foreground">
                        Direcione sua pesquisa para perfis específicos: moradores de bairros estratégicos, faixas etárias decisivas, níveis de renda que definem eleições. Dados precisos dos eleitores que realmente importam.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-primary/10 shrink-0">
                      <CheckCircle2 className="w-6 h-6 text-foreground" />
                    </div>
                    <div>
                      <h4 className="font-bold text-lg mb-2">Velocidade Brutal na Coleta</h4>
                      <p className="text-muted-foreground">
                        Pesquisas tradicionais levam semanas. Com Google Ads, você tem milhares de respostas em dias. Tome decisões estratégicas enquanto seus concorrentes ainda estão coletando dados.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-primary/10 shrink-0">
                      <CheckCircle2 className="w-6 h-6 text-foreground" />
                    </div>
                    <div>
                      <h4 className="font-bold text-lg mb-2">Custo Acessível</h4>
                      <p className="text-muted-foreground">
                        Pesquisas profissionais custam dezenas de milhares. Com nossa plataforma integrada ao Google Ads, você gasta uma fração disso e obtém dados ainda mais precisos e acionáveis.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-primary/10 shrink-0">
                      <CheckCircle2 className="w-6 h-6 text-foreground" />
                    </div>
                    <div>
                      <h4 className="font-bold text-lg mb-2">Dados Demográficos Completos</h4>
                      <p className="text-muted-foreground">
                        Capture automaticamente idade, gênero, escolaridade, profissão, renda e ideologia de cada respondente. Cruze informações e descubra insights que vencem eleições.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-primary/10 shrink-0">
                      <CheckCircle2 className="w-6 h-6 text-foreground" />
                    </div>
                    <div>
                      <h4 className="font-bold text-lg mb-2">Controle Total do Processo</h4>
                      <p className="text-muted-foreground">
                        Você decide quando começar, quando parar, quem alcançar e quanto investir. Total autonomia sem depender de institutos externos caros e inflexíveis.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-primary/10 shrink-0">
                      <CheckCircle2 className="w-6 h-6 text-foreground" />
                    </div>
                    <div>
                      <h4 className="font-bold text-lg mb-2">Resultados em Tempo Real</h4>
                      <p className="text-muted-foreground">
                        Acompanhe respostas chegando ao vivo. Ajuste perguntas, refine segmentação e otimize sua coleta enquanto a pesquisa ainda está ativa. Agilidade que pesquisas tradicionais nunca terão.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              
            </div>
          </div>
        </div>
      </section>

      <section className="py-32 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6">
                  <FileText className="w-4 h-4" />
                  <span className="text-sm font-medium">Sistema de Pesquisas</span>
                </div>
                
                <h2 className="text-4xl md:text-5xl font-bold mb-6" data-testid="text-surveys-title">
                  Pesquisas Eleitorais Profissionais 100% TSE-Compliant
                </h2>
                
                <p className="text-xl text-muted-foreground mb-8">
                  Crie, distribua e analise pesquisas eleitorais de nível profissional com total conformidade legal. Landing pages automáticas, coleta de dados demográficos e relatórios executivos em PDF.
                </p>

                <div className="space-y-4 mb-8">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-foreground" />
                    </div>
                    <div>
                      <h4 className="font-semibold mb-1">Templates Pré-Aprovados TSE</h4>
                      <p className="text-muted-foreground text-sm">
                        Biblioteca completa de modelos de perguntas que seguem todas as normas eleitorais brasileiras.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-foreground" />
                    </div>
                    <div>
                      <h4 className="font-semibold mb-1">Landing Pages Públicas Automáticas</h4>
                      <p className="text-muted-foreground text-sm">
                        Cada pesquisa gera automaticamente uma página pública otimizada em politicall.com.br/pesquisa/seu-slug
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-foreground" />
                    </div>
                    <div>
                      <h4 className="font-semibold mb-1">Workflow de Aprovação Admin</h4>
                      <p className="text-muted-foreground text-sm">
                        Moderação administrativa revisa todas as pesquisas antes de ficarem públicas, garantindo conformidade total.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-foreground" />
                    </div>
                    <div>
                      <h4 className="font-semibold mb-1">Coleta Demográfica Completa</h4>
                      <p className="text-muted-foreground text-sm">
                        Captura automática de gênero, faixa etária, escolaridade, renda, profissão e ideologia política de cada respondente.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-foreground" />
                    </div>
                    <div>
                      <h4 className="font-semibold mb-1">Analytics e Gráficos em Tempo Real</h4>
                      <p className="text-muted-foreground text-sm">
                        Veja respostas chegando ao vivo, cruze dados demográficos e identifique tendências antes da pesquisa terminar.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                      <CheckCircle2 className="w-5 h-5 text-foreground" />
                    </div>
                    <div>
                      <h4 className="font-semibold mb-1">Relatórios PDF Executivos</h4>
                      <p className="text-muted-foreground text-sm">
                        Exportação profissional com gráficos coloridos, tabelas detalhadas e insights estratégicos para sua campanha.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative">
                <div className="rounded-xl overflow-hidden shadow-2xl border">
                  <img 
                    src={marketingImage} 
                    alt="Sistema de Pesquisas Eleitorais Politicall" 
                    className="w-full h-auto"
                    data-testid="img-surveys-screenshot"
                  />
                </div>

                <div className="absolute -bottom-8 -left-8 bg-primary text-primary-foreground p-6 rounded-xl shadow-2xl max-w-xs">
                  <div className="flex items-center gap-3 mb-2">
                    <Shield className="w-6 h-6" />
                    <div className="text-2xl font-bold">100%</div>
                  </div>
                  <div className="text-sm opacity-90">Compliance TSE Garantido</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-4xl md:text-5xl font-bold mb-6" data-testid="text-cta-final-title">
              Pronto para Transformar Sua Carreira Política?
            </h2>
            <p className="text-xl text-muted-foreground mb-8">
              Junte-se a centenas de políticos que já usam Politicall para vencer eleições e servir melhor seus eleitores.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                className="rounded-full text-lg px-8 py-6 h-auto"
                onClick={() => scrollToSection('contato')}
                data-testid="button-cta-final"
              >
                Solicitar Demonstração Gratuita <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="rounded-full text-lg px-8 py-6 h-auto"
                onClick={() => setLocation("/login")}
                data-testid="button-login-final"
              >
                Fazer Login
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section id="contato" className="py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-4xl md:text-5xl font-bold mb-4" data-testid="text-contact-title">Entre em Contato</h2>
              <p className="text-xl text-muted-foreground">
                Preencha o formulário abaixo e nossa equipe entrará em contato em até 24 horas
              </p>
            </div>

            <Card className="border-0 shadow-xl">
              <CardContent className="p-8">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome Completo *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Seu nome completo" 
                              {...field} 
                              data-testid="input-name"
                              className="rounded-full"
                            />
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
                            <FormLabel>E-mail *</FormLabel>
                            <FormControl>
                              <Input 
                                type="email"
                                placeholder="seu@email.com" 
                                {...field} 
                                data-testid="input-email"
                                className="rounded-full"
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
                            <FormLabel>Telefone *</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="(00) 00000-0000" 
                                {...field} 
                                data-testid="input-phone"
                                className="rounded-full"
                              />
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
                              <SelectTrigger data-testid="select-position" className="rounded-full">
                                <SelectValue placeholder="Selecione seu cargo" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {POSITION_OPTIONS.map((group) => (
                                <div key={group.category}>
                                  <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                                    {group.category}
                                  </div>
                                  {group.positions.map((pos) => (
                                    <SelectItem key={pos} value={pos}>
                                      {pos}
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
                                <SelectTrigger data-testid="select-state" className="rounded-full">
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
                            <FormLabel>Cidade *</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Sua cidade" 
                                {...field} 
                                data-testid="input-city"
                                className="rounded-full"
                              />
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
                          <FormLabel>Mensagem (Opcional)</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Conte-nos sobre suas necessidades..."
                              className="min-h-32 rounded-2xl"
                              {...field}
                              data-testid="input-message"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      size="lg"
                      className="w-full rounded-full"
                      disabled={leadMutation.isPending}
                      data-testid="button-submit-lead"
                    >
                      {leadMutation.isPending ? "Enviando..." : "Solicitar Demonstração"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <footer className="py-12 border-t bg-background">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src={logoUrl} alt="Politicall" className="h-8" data-testid="img-footer-logo" />
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
