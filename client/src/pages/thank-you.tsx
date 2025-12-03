import { useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, ArrowLeft, Home } from "lucide-react";
import logoUrl from "@assets/logo pol_1763308638963.png";

export default function ThankYouPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    document.title = "Obrigado! - Politicall";
    
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', 'Obrigado por entrar em contato com a Politicall. Nossa equipe entrará em contato em breve.');
    }
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header simples */}
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-4">
          <img 
            src={logoUrl} 
            alt="Politicall" 
            className="h-6 cursor-pointer" 
            onClick={() => setLocation("/")}
            data-testid="img-logo"
          />
        </div>
      </header>

      {/* Conteúdo principal */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <Card className="max-w-2xl w-full" data-testid="card-thank-you">
          <CardContent className="p-8 md:p-12 text-center">
            {/* Título principal */}
            <h1 
              className="text-3xl md:text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent"
              data-testid="text-title"
            >
              Mensagem Enviada com Sucesso!
            </h1>

            {/* Mensagem */}
            <p className="text-lg text-muted-foreground mb-8" data-testid="text-message">
              Obrigado por solicitar uma demonstração da Politicall. 
              Nossa equipe entrará em contato em breve para apresentar 
              como nossa plataforma pode transformar sua gestão política.
            </p>

            {/* Divider */}
            <div className="border-t my-8"></div>

            {/* Informações adicionais */}
            <div className="bg-muted/50 rounded-lg p-6 mb-8 text-left">
              <h2 className="font-semibold mb-3 text-foreground" data-testid="text-next-steps-title">
                Próximos Passos:
              </h2>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                  <span>Nossa equipe analisará suas informações</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                  <span>Você receberá um contato dentro de 24 horas úteis</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                  <span>Prepararemos uma demonstração personalizada para suas necessidades</span>
                </li>
              </ul>
            </div>

            {/* Botões de ação */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                variant="outline"
                size="lg"
                onClick={() => setLocation("/")}
                className="gap-2"
                data-testid="button-back-home"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar para Início
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Footer simples */}
      <footer className="border-t py-6 bg-background">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>&copy; 2025 Politicall. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
