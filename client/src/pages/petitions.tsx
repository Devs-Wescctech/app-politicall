import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollText, ExternalLink, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Petitions() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Petições</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie petições e abaixo-assinados para causas políticas
          </p>
        </div>
      </div>

      <Alert className="border-primary/20 bg-primary/5">
        <Info className="h-4 w-4 text-primary" />
        <AlertTitle>Módulo em Desenvolvimento</AlertTitle>
        <AlertDescription>
          O módulo de Petições está sendo preparado para integração via API. 
          Em breve você poderá criar, gerenciar e acompanhar petições e abaixo-assinados 
          diretamente desta plataforma.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card data-testid="card-petitions-total">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Total de Petições</CardTitle>
            <ScrollText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground">Aguardando integração</p>
          </CardContent>
        </Card>

        <Card data-testid="card-petitions-active">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Petições Ativas</CardTitle>
            <ScrollText className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground">Aguardando integração</p>
          </CardContent>
        </Card>

        <Card data-testid="card-petitions-signatures">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Total de Assinaturas</CardTitle>
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground">Aguardando integração</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Funcionalidades Planejadas</CardTitle>
          <CardDescription>
            O módulo de Petições permitirá gerenciar campanhas de abaixo-assinados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <ScrollText className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <span>Criar e gerenciar petições com título, descrição e meta de assinaturas</span>
            </li>
            <li className="flex items-start gap-2">
              <ScrollText className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <span>Landing pages públicas para coleta de assinaturas</span>
            </li>
            <li className="flex items-start gap-2">
              <ScrollText className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <span>Dashboard com métricas de engajamento em tempo real</span>
            </li>
            <li className="flex items-start gap-2">
              <ScrollText className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <span>Exportação de assinaturas para entrega aos órgãos competentes</span>
            </li>
            <li className="flex items-start gap-2">
              <ScrollText className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <span>Compartilhamento via redes sociais e QR Code</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
