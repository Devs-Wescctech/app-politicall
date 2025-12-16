import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LayoutDashboard, Users, Handshake, FileText, Calendar, BarChart3, Bot, UserCog, Settings } from "lucide-react";
import { useLocation } from "wouter";

export default function AdminManual() {
  const [, setLocation] = useLocation();
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (hash) {
        setHighlightedId(hash);
        setTimeout(() => setHighlightedId(null), 1500);
      }
    };
    
    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const sections = [
    {
      id: "visao-geral",
      title: "Visao Geral da Plataforma Politicall",
      icon: <LayoutDashboard className="w-5 h-5" />,
      content: "A Politicall e uma plataforma completa de gestao politica, desenvolvida para centralizar, organizar e potencializar campanhas eleitorais, mandatos e articulacoes politicas. Ela integra dados de eleitores, aliancas politicas, demandas do gabinete, agenda, pesquisas de opiniao, atendimento automatizado por IA e gestao de equipes em um unico ambiente seguro e estrategico. A plataforma foi criada para oferecer controle total, visao estrategica em tempo real e conformidade com as normas legais e eleitorais brasileiras, especialmente as diretrizes do TSE. Com a Politicall, voce transforma informacoes dispersas em inteligencia politica acionavel."
    },
    {
      id: "dashboard",
      title: "Dashboard e Indicadores Estrategicos",
      icon: <BarChart3 className="w-5 h-5" />,
      content: "O Dashboard e a tela principal da plataforma e serve como centro de comando estrategico. Ele reune indicadores em tempo real que permitem uma visao clara da evolucao da campanha ou mandato. Voce acompanha: Metas de Campanha (como superar o numero de votos da ultima eleicao), total de Eleitores cadastrados versus a meta definida, progresso na construcao de Aliancas Politicas, quantidade de Demandas pendentes, em andamento e concluidas, Eventos Agendados, Demografia dos Eleitores (analise por genero e faixa etaria) e status das Pesquisas Mercadologicas. Sua importancia esta em permitir decisoes rapidas e fundamentadas em dados reais."
    },
    {
      id: "eleitores",
      title: "Modulo Eleitores",
      icon: <Users className="w-5 h-5" />,
      content: "O modulo Eleitores e um dos pilares da plataforma. Ele permite o cadastro, organizacao e analise detalhada da base eleitoral, transformando dados em inteligencia politica. Os eleitores podem ser cadastrados manualmente, com informacoes completas como dados pessoais, interesses, religiao, esportes, educacao e preferencias diversas. Alem disso, a plataforma oferece uma pagina publica de apoiadores, gerada automaticamente com QR Code, que pode ser compartilhada para captacao organica. O sistema consolida estatisticas como distribuicao geografica, genero, fontes de cadastro e interesses mais populares. Tambem permite envio de e-mails em massa e exportacao de contatos de WhatsApp para acoes de comunicacao externa."
    },
    {
      id: "aliancas",
      title: "Modulo Aliancas Politicas",
      icon: <Handshake className="w-5 h-5" />,
      content: "O modulo de Aliancas Politicas foi desenvolvido para organizar e monitorar o relacionamento com lideres, partidos e apoiadores estrategicos. Ele permite cadastrar aliados por estado, cidade e partido politico, criando uma estrutura organizada de apoios. A plataforma disponibiliza paginas publicas de convite para aliancas, permitindo acompanhar quem aceitou, quem esta aguardando resposta e quem recusou. As aliancas sao organizadas em pastas por partido, seguindo o cenario eleitoral vigente. Sua importancia esta em fortalecer articulacoes estrategicas e visualizar claramente o mapa de apoios politicos."
    },
    {
      id: "demandas",
      title: "Modulo Demandas do Gabinete",
      icon: <FileText className="w-5 h-5" />,
      content: "Este modulo centraliza todas as demandas politicas e administrativas do gabinete em um sistema organizado. Permite criar, acompanhar e classificar demandas como pendentes, em andamento ou concluidas, com atribuicao de responsaveis e prazos. A organizacao das demandas garante agilidade, transparencia e controle, evitando perdas de informacoes e melhorando a eficiencia do atendimento a populacao. E essencial para gabinetes que precisam responder rapidamente as solicitacoes de eleitores e parceiros, mantendo historico completo de cada atendimento."
    },
    {
      id: "agenda",
      title: "Modulo Agenda Integrada",
      icon: <Calendar className="w-5 h-5" />,
      content: "O modulo Agenda e totalmente integrado ao Google Calendar, oferecendo sincronizacao completa e bidirecional. Os eventos podem ser visualizados tanto em formato tradicional de calendario quanto em uma linha do tempo (timeline) para facilitar a visualizacao dos proximos compromissos. Permite cadastrar eventos unicos ou recorrentes (diarios, semanais, mensais), com informacoes de local, horario e descricao. Sua importancia esta em manter toda a equipe alinhada sobre compromissos, evitando conflitos de agenda e garantindo que nenhum evento importante seja esquecido."
    },
    {
      id: "pesquisas",
      title: "Pesquisas de Intencao de Voto",
      icon: <BarChart3 className="w-5 h-5" />,
      content: "O modulo de pesquisas permite criar, gerenciar e analisar pesquisas de opiniao publica em total conformidade com o TSE e com as diretrizes de trafego pago do Google Ads. Voce pode criar perguntas personalizadas com diferentes tipos de resposta (multipla escolha, escala, texto livre) e coletar dados demograficos dos respondentes. As pesquisas podem ser divulgadas manualmente atraves de paginas publicas ou impulsionadas por trafego pago, gerenciado pela equipe da Politicall, sem necessidade de configuracoes tecnicas por parte do usuario. Os resultados sao apresentados em graficos e estatisticas detalhadas para embasar decisoes estrategicas."
    },
    {
      id: "ia",
      title: "Atendimento por Inteligencia Artificial",
      icon: <Bot className="w-5 h-5" />,
      content: "O modulo de Atendimento por IA automatiza o atendimento no Facebook Messenger e Instagram Direct, oferecendo diferentes modos de operacao. O Modo Compliance TSE garante respostas adequadas durante o periodo eleitoral, evitando problemas legais. O Modo Formal oferece atendimento profissional para o dia a dia do mandato. A IA pode ser treinada e personalizada com informacoes sobre o politico, posicionamentos e propostas, garantindo respostas alinhadas e consistentes. Sua importancia esta em oferecer atendimento 24 horas, escalavel, sem aumentar custos com equipe, mantendo a qualidade e padronizacao das respostas."
    },
    {
      id: "usuarios",
      title: "Gerenciamento de Usuarios e Voluntarios",
      icon: <UserCog className="w-5 h-5" />,
      content: "A plataforma permite criar diferentes perfis de usuarios com niveis de acesso personalizados. Os perfis disponiveis sao: Administrador (acesso total), Coordenador (gestao de equipes) e Assessor (funcoes especificas). Alem disso, o sistema oferece gestao completa de Voluntarios de campanha, com codigo unico para cada voluntario, paginas publicas personalizadas para captacao de apoiadores e ranking de atividades para acompanhar o desempenho. E fundamental para organizar equipes grandes e garantir que cada pessoa tenha acesso apenas ao que precisa."
    },
    {
      id: "configuracoes",
      title: "Configuracoes Administrativas",
      icon: <Settings className="w-5 h-5" />,
      content: "O modulo de configuracoes permite personalizar toda a plataforma de acordo com suas necessidades. Voce pode gerenciar: Perfil Politico (nome, foto, partido, cargo), Integracoes (Google Calendar, redes sociais), Informacoes da Conta (dados de acesso e seguranca), Ativacao ou Bloqueio de Modulos (mostrar apenas o que sua equipe precisa) e Identidade Visual (cores e logotipo). Essas configuracoes garantem que a plataforma esteja sempre alinhada a realidade politica, estrategica e operacional do usuario, oferecendo uma experiencia personalizada."
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/admin")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <p className="text-sm text-muted-foreground">Manual Oficial do Usuario</p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-6 pb-24">
        {/* Hero */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-foreground mb-2">
            Plataforma de Gestao Politica Completa
          </h2>
          <p className="text-muted-foreground">
            Gestao estrategica de campanhas, mandatos e articulacoes politicas
          </p>
        </div>

        {/* Sumário */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">Sumario</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {sections.map((section, index) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    <span className="font-medium text-foreground">{index + 1}</span>
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        {/* Sections */}
        <div className="space-y-6">
          {sections.map((section, index) => (
            <Card key={section.id} id={section.id} className={`scroll-mt-20 transition-all duration-700 ${highlightedId === section.id ? "bg-primary/5" : ""}`}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-3 text-base">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    {section.icon}
                  </div>
                  <span>{index + 1}. {section.title}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {section.content}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground">
            www.politicall.com.br
          </p>
        </div>
      </main>
    </div>
  );
}
