import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LayoutDashboard, Users, Handshake, FileText, Calendar, BarChart3, Bot, UserCog, Settings } from "lucide-react";
import { useLocation } from "wouter";

export default function Manual() {
  const [, setLocation] = useLocation();

  const sections = [
    {
      id: "visao-geral",
      title: "Visao Geral da Plataforma Politicall",
      icon: <LayoutDashboard className="w-5 h-5" />,
      content: "A Politicall e uma plataforma de gestao politica desenvolvida para centralizar dados, automatizar processos e transformar informacoes em inteligencia estrategica. Ela atende campanhas eleitorais, mandatos e articulacoes politicas com total conformidade legal."
    },
    {
      id: "dashboard",
      title: "Dashboard e Indicadores Estrategicos",
      icon: <BarChart3 className="w-5 h-5" />,
      content: "O Dashboard oferece uma visao consolidada da operacao politica, com metas eleitorais, progresso de eleitores, aliancas, demandas, eventos, demografia e pesquisas. E o centro de decisao estrategica da plataforma."
    },
    {
      id: "eleitores",
      title: "Modulo Eleitores",
      icon: <Users className="w-5 h-5" />,
      content: "Permite cadastro manual ou via pagina publica de apoiadores com QR Code. Consolida dados demograficos, interesses, localizacao e fontes de cadastro, alem de permitir comunicacao por e-mail e exportacao de contatos."
    },
    {
      id: "aliancas",
      title: "Modulo Aliancas Politicas",
      icon: <Handshake className="w-5 h-5" />,
      content: "Organiza aliados por partido, estado e cidade. Oferece paginas publicas de convite e acompanhamento de status das aliancas, fortalecendo articulacoes estrategicas."
    },
    {
      id: "demandas",
      title: "Modulo Demandas do Gabinete",
      icon: <FileText className="w-5 h-5" />,
      content: "Centraliza demandas politicas e administrativas em fluxos claros de pendente, em andamento e concluido, garantindo eficiencia e transparencia."
    },
    {
      id: "agenda",
      title: "Modulo Agenda Integrada",
      icon: <Calendar className="w-5 h-5" />,
      content: "Integracao total com Google Calendar, com visualizacao tradicional e em timeline, permitindo sincronizacao automatica de compromissos."
    },
    {
      id: "pesquisas",
      title: "Pesquisas de Intencao de Voto",
      icon: <BarChart3 className="w-5 h-5" />,
      content: "Criacao e gestao de pesquisas em conformidade com o TSE. Divulgacao manual ou via trafego pago gerenciado pela equipe Politicall, sem necessidade de configuracao tecnica."
    },
    {
      id: "ia",
      title: "Atendimento por Inteligencia Artificial",
      icon: <Bot className="w-5 h-5" />,
      content: "Automacao de atendimento no Facebook e Instagram, com modos Compliance TSE e Formal, garantindo seguranca, padronizacao e escala."
    },
    {
      id: "usuarios",
      title: "Gerenciamento de Usuarios e Voluntarios",
      icon: <UserCog className="w-5 h-5" />,
      content: "Criacao de perfis com permissoes especificas, acompanhamento por ranking de atividades e gestao completa de voluntarios de campanha."
    },
    {
      id: "configuracoes",
      title: "Configuracoes Administrativas",
      icon: <Settings className="w-5 h-5" />,
      content: "Gestao do perfil politico, integracoes, ativacao de modulos, identidade visual e informacoes da conta."
    }
  ];

  return (
    <div className="min-h-full bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/dashboard")}
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
            <Card key={section.id} id={section.id}>
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
