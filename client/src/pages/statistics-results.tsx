import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function StatisticsResults() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/statistics">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-foreground" data-testid="heading-results">
            Resultados de Eleições
          </h1>
          <p className="text-muted-foreground">
            Consulte resultados oficiais das eleições por ano, cargo e localidade
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Página de Resultados Funcionando!</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Esta é a página de Resultados de Eleições do TSE.</p>
        </CardContent>
      </Card>
    </div>
  );
}
