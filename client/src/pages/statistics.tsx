import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { BarChart3, Users, TrendingUp, Vote, PieChart, MapPin } from "lucide-react";

export default function Statistics() {
  const sections = [
    {
      title: "Resultados de Eleições",
      description: "Consulte resultados oficiais das eleições por ano, cargo, estado e município",
      icon: Vote,
      url: "/statistics/results",
      color: "text-primary",
    },
    {
      title: "Perfil do Eleitorado",
      description: "Análise demográfica do eleitorado: idade, escolaridade, gênero e distribuição regional",
      icon: Users,
      url: "/statistics/electorate",
      color: "text-primary",
    },
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground" data-testid="heading-statistics">
          Estatísticas Eleitorais
        </h1>
        <p className="text-muted-foreground">
          Dados oficiais do Tribunal Superior Eleitoral (TSE) com visualizações intuitivas e profissionais
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sections.map((section) => (
          <Link key={section.url} href={section.url}>
            <Card className="cursor-pointer transition-all duration-200 hover-elevate active-elevate-2 h-full" data-testid={`card-${section.url.split('/').pop()}`}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-primary/10 rounded-full">
                    <section.icon className={`w-6 h-6 ${section.color}`} />
                  </div>
                  <CardTitle className="text-lg">{section.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm">
                  {section.description}
                </CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-sm">Sobre os dados</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            📊 <strong>Fonte:</strong> Portal de Dados Abertos do TSE (dadosabertos.tse.jus.br)
          </p>
          <p>
            🔄 <strong>Atualização:</strong> Dados atualizados diariamente. Durante eleições, resultados em tempo real.
          </p>
          <p>
            📅 <strong>Período:</strong> Estatísticas desde 2004 até eleições mais recentes
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
