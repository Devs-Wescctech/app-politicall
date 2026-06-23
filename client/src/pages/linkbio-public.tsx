import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Users, ArrowRight } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface BioPetition {
  id: string;
  title: string;
  slug: string;
  goal: number;
  signaturesCount: number;
}

interface PublicBioPage {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  avatarUrl: string | null;
  backgroundColor: string | null;
  status: string;
  petitions: BioPetition[];
}

export default function LinkBioPublic() {
  const { slug } = useParams<{ slug: string }>();
  const { data: page, isLoading } = useQuery<PublicBioPage>({
    queryKey: ["/api/public/linkbio", slug],
    enabled: !!slug,
  });

  if (isLoading || !page) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600">
        <Loader2 className="w-12 h-12 animate-spin text-white" />
      </div>
    );
  }

  const bg = page.backgroundColor || "#6366f1";

  return (
    <div className="min-h-screen py-12 px-4" style={{ background: `linear-gradient(to bottom right, ${bg}, ${bg}cc)` }}>
      <div className="max-w-md mx-auto">
        <div className="flex flex-col items-center text-center mb-8">
          <Avatar className="w-24 h-24 mb-4 border-4 border-white/30">
            {page.avatarUrl && <AvatarImage src={page.avatarUrl} alt={page.title} />}
            <AvatarFallback className="text-2xl">{page.title.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <h1 className="text-2xl font-black text-white" data-testid="text-bio-title">{page.title}</h1>
          {page.description && <p className="text-white/85 mt-2" data-testid="text-bio-description">{page.description}</p>}
        </div>

        <div className="space-y-3">
          {page.petitions.length === 0 ? (
            <p className="text-center text-white/80" data-testid="text-bio-empty">Nenhuma petição disponível no momento.</p>
          ) : (
            page.petitions.map((p) => {
              const progress = Math.min((p.signaturesCount / p.goal) * 100, 100);
              return (
                <Link key={p.id} href={`/p/${p.slug}`} data-testid={`link-petition-${p.id}`}>
                  <a className="block bg-white rounded-md p-4 hover-elevate active-elevate-2">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-semibold flex-1" data-testid={`text-petition-title-${p.id}`}>{p.title}</h3>
                      <ArrowRight className="w-5 h-5 text-muted-foreground shrink-0" />
                    </div>
                    <div className="mt-3">
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: bg }} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        <span data-testid={`text-petition-signatures-${p.id}`}>{p.signaturesCount.toLocaleString("pt-BR")}</span> de {p.goal.toLocaleString("pt-BR")} assinaturas
                      </p>
                    </div>
                  </a>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
