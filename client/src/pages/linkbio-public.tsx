import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Users, ArrowRight } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getPublicResourceState } from "@/lib/public-resource-state";

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
  const { data: page, isLoading, isError } = useQuery<PublicBioPage>({
    queryKey: ["/api/public/linkbio", slug],
    enabled: !!slug,
  });

  const resourceState = getPublicResourceState({
    isLoading,
    isError,
    hasData: !!page,
  });

  if (resourceState === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-500 to-cyan-600">
        <Loader2 className="w-12 h-12 animate-spin text-white" />
      </div>
    );
  }

  if (resourceState === "error" || !page) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
        <div className="max-w-md text-center text-white">
          <h1 className="text-2xl font-bold" data-testid="text-public-bio-error-title">Página não encontrada</h1>
          <p className="mt-2 text-sm text-white/70" data-testid="text-public-bio-error-description">
            O link pode estar incorreto, indisponível ou a página pode ter sido retirada do ar.
          </p>
        </div>
      </main>
    );
  }

  const bg = page.backgroundColor || "#14b8a6";

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
              const progress = p.goal > 0 ? Math.min((p.signaturesCount / p.goal) * 100, 100) : 0;
              return (
                <Link key={p.id} href={`/p/${p.slug}`} data-testid={`link-petition-${p.id}`}>
                  <a className="block rounded-md border border-white/70 bg-white p-4 shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="flex-1 font-semibold text-slate-950" data-testid={`text-petition-title-${p.id}`}>{p.title}</h3>
                      <ArrowRight className="w-5 h-5 text-slate-500 shrink-0" />
                    </div>
                    <div className="mt-3">
                      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, backgroundColor: bg }} />
                      </div>
                      <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-slate-600">
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
