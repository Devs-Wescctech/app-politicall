import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ExternalLink } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface TreeLink {
  id: string;
  title: string;
  url: string;
  icon?: string | null;
}

interface PublicTreePage {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  avatarUrl: string | null;
  backgroundColor: string | null;
  textColor: string | null;
  status: string;
  links: TreeLink[];
}

export default function LinkTreePublic() {
  const { slug } = useParams<{ slug: string }>();
  const { data: page, isLoading } = useQuery<PublicTreePage>({
    queryKey: ["/api/public/linktree", slug],
    enabled: !!slug,
  });

  if (isLoading || !page) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-900">
        <Loader2 className="w-12 h-12 animate-spin text-white" />
      </div>
    );
  }

  const bg = page.backgroundColor || "#0f172a";
  const textColor = page.textColor || "#ffffff";

  return (
    <div className="min-h-screen py-12 px-4" style={{ backgroundColor: bg }}>
      <div className="max-w-md mx-auto">
        <div className="flex flex-col items-center text-center mb-8">
          <Avatar className="w-24 h-24 mb-4 border-4" style={{ borderColor: `${textColor}40` }}>
            {page.avatarUrl && <AvatarImage src={page.avatarUrl} alt={page.title} />}
            <AvatarFallback className="text-2xl">{page.title.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <h1 className="text-2xl font-black" style={{ color: textColor }} data-testid="text-tree-title">{page.title}</h1>
          {page.description && <p className="mt-2 opacity-85" style={{ color: textColor }} data-testid="text-tree-description">{page.description}</p>}
        </div>

        <div className="space-y-3">
          {page.links.length === 0 ? (
            <p className="text-center opacity-80" style={{ color: textColor }} data-testid="text-tree-empty">Nenhum link disponível no momento.</p>
          ) : (
            page.links.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 bg-white rounded-md px-5 py-4 hover-elevate active-elevate-2"
                data-testid={`link-tree-${link.id}`}
              >
                <span className="font-semibold flex-1 text-center">{link.title}</span>
                <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
              </a>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
