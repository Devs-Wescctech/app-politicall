import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { User } from "lucide-react";
import { getAuthUser } from "@/lib/auth";

export default function Settings() {
  const user = getAuthUser();

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Configurações</h1>
        <p className="text-muted-foreground mt-2">Gerencie suas preferências e informações da conta</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Informações da Conta</CardTitle>
              <CardDescription>Detalhes do seu perfil</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Nome</label>
                <p className="text-base mt-1" data-testid="text-user-name">{user?.name || "-"}</p>
              </div>
              <Separator />
              <div>
                <label className="text-sm font-medium text-muted-foreground">Email</label>
                <p className="text-base mt-1" data-testid="text-user-email">{user?.email || "-"}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sobre a Plataforma</CardTitle>
              <CardDescription>Informações do sistema</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Versão</label>
                <p className="text-base mt-1">1.0.0</p>
              </div>
              <Separator />
              <div>
                <label className="text-sm font-medium text-muted-foreground">Plataforma</label>
                <p className="text-base mt-1">Gestão Política Completa</p>
              </div>
              <Separator />
              <div>
                <label className="text-sm font-medium text-muted-foreground">Módulos Ativos</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge>Eleitores</Badge>
                  <Badge>Aliança Política</Badge>
                  <Badge>Demandas</Badge>
                  <Badge>Agenda</Badge>
                  <Badge>Atendimento IA</Badge>
                  <Badge>Marketing</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Perfil
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-center">
                <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-12 h-12 text-primary" />
                </div>
              </div>
              <div className="text-center">
                <p className="font-semibold text-lg">{user?.name}</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recursos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Eleitores</span>
                  <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20">Ativo</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Alianças</span>
                  <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20">Ativo</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Demandas</span>
                  <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20">Ativo</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Agenda</span>
                  <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20">Ativo</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Atendimento IA</span>
                  <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20">Ativo</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Marketing</span>
                  <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20">Ativo</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
