import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getPublicResourceState } from "@/lib/public-resource-state";
import {
  Loader2, Users, Target, TrendingUp, CheckCircle2, Share2,
  MessageCircle, Facebook, Twitter, Send, Link as LinkIcon, ChevronDown, ChevronUp,
} from "lucide-react";

interface PublicPetition {
  id: string;
  title: string;
  description: string;
  bannerUrl: string | null;
  logoUrl: string | null;
  videoUrl: string | null;
  primaryColor: string | null;
  shareText: string | null;
  goal: number;
  status: string;
  slug: string;
  collectPhone: boolean | null;
  collectCity: boolean | null;
  collectState: boolean | null;
  collectCpf: boolean | null;
  collectEmail: boolean | null;
  collectComment: boolean | null;
  requireEmail: boolean | null;
  requirePhone: boolean | null;
  requireLocation: boolean | null;
  requireCpf: boolean | null;
  requireComment: boolean | null;
  lgpdText: string | null;
  signaturesCount: number;
}

function validateCpf(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let r = (sum * 10) % 11;
  if (r === 10) r = 0;
  if (r !== parseInt(digits[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10) r = 0;
  return r === parseInt(digits[10]);
}

function formatCpf(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function renderVideo(url: string) {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
  if (yt) {
    return (
      <iframe
        title="Vídeo da petição no YouTube"
        src={`https://www.youtube.com/embed/${yt[1]}`}
        className="w-full aspect-video rounded-md border-4 border-white/20"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        data-testid="video-petition"
      />
    );
  }
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) {
    return (
      <iframe
        title="Vídeo da petição no Vimeo"
        src={`https://player.vimeo.com/video/${vimeo[1]}`}
        className="w-full aspect-video rounded-md border-4 border-white/20"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        data-testid="video-petition"
      />
    );
  }
  return <video src={url} controls className="w-full aspect-video rounded-md border-4 border-white/20 object-cover" data-testid="video-petition" />;
}

export default function PetitionPublic() {
  const { slug } = useParams<{ slug: string }>();
  const [showSuccess, setShowSuccess] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedLgpd, setAcceptedLgpd] = useState(false);
  const [cpfError, setCpfError] = useState("");
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({
    name: "", email: "", phone: "", city: "", state: "", cpf: "", comment: "",
  });

  const { data: petition, isLoading, isError } = useQuery<PublicPetition>({
    queryKey: ["/api/public/petitions", slug],
    enabled: !!slug,
  });

  const signMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", `/api/public/petitions/${slug}/sign`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/public/petitions", slug] });
      setShowSuccess(true);
      setForm({ name: "", email: "", phone: "", city: "", state: "", cpf: "", comment: "" });
      setAcceptedTerms(false);
      setAcceptedLgpd(false);
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const resourceState = getPublicResourceState({
    isLoading,
    isError,
    hasData: !!petition,
  });

  if (resourceState === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-500 to-cyan-600">
        <Loader2 className="w-12 h-12 animate-spin text-white" />
      </div>
    );
  }

  if (resourceState === "error" || !petition) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
        <div className="max-w-md text-center text-white">
          <h1 className="text-2xl font-bold" data-testid="text-public-error-title">Petição não encontrada</h1>
          <p className="mt-2 text-sm text-white/70" data-testid="text-public-error-description">
            O link pode estar incorreto, indisponível ou a petição pode ter sido retirada do ar.
          </p>
        </div>
      </main>
    );
  }

  const primaryColor = petition.primaryColor || "#14b8a6";
  const progress = petition.goal > 0 ? Math.min((petition.signaturesCount / petition.goal) * 100, 100) : 0;
  const shareUrl = `${window.location.origin}/p/${petition.slug}`;
  const shareText = petition.shareText
    ? petition.shareText.replace("{link}", shareUrl)
    : `Acabei de assinar "${petition.title}". Junte-se a mim! ${shareUrl}`;
  const labelClass = "text-sm font-semibold text-slate-700";
  const inputClass = "border-slate-300 bg-white text-slate-950 shadow-sm placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-0";
  const checkboxClass = "mt-0.5 border-slate-400 bg-white data-[state=checked]:text-white";

  const socialShares = [
    { name: "WhatsApp", icon: MessageCircle, url: `https://wa.me/?text=${encodeURIComponent(shareText)}` },
    { name: "Facebook", icon: Facebook, url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}` },
    { name: "Twitter", icon: Twitter, url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}` },
    { name: "Telegram", icon: Send, url: `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}` },
  ];

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl).catch(() => {});
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!form.name.trim()) { setFormError("Por favor, informe seu nome."); return; }
    if (petition.requireEmail && !form.email.trim()) { setFormError("E-mail é obrigatório."); return; }
    if (petition.requirePhone && !form.phone.trim()) { setFormError("Telefone é obrigatório."); return; }
    if (petition.requireLocation && !form.city.trim() && !form.state.trim()) { setFormError("Informe sua localidade."); return; }
    if (petition.collectCpf && form.cpf) {
      if (!validateCpf(form.cpf)) { setCpfError("CPF inválido"); return; }
    }
    if (petition.requireCpf && !form.cpf.trim()) { setFormError("CPF é obrigatório."); return; }
    if (petition.requireComment && !form.comment.trim()) { setFormError("Comentário é obrigatório."); return; }
    if (!acceptedTerms) { setFormError("Você precisa aceitar os termos."); return; }
    if (petition.lgpdText && !acceptedLgpd) { setFormError("Você precisa aceitar a política de privacidade."); return; }

    const payload: Record<string, unknown> = { name: form.name.trim() };
    if (petition.collectEmail && form.email) payload.email = form.email.trim();
    if (petition.collectPhone && form.phone) payload.phone = form.phone.trim();
    if (petition.collectCity && form.city) payload.city = form.city.trim();
    if (petition.collectState && form.state) payload.state = form.state.trim();
    if (petition.collectCpf && form.cpf) payload.cpf = form.cpf.trim();
    if (petition.collectComment && form.comment) payload.comment = form.comment.trim();
    payload.acceptedTerms = acceptedTerms;
    if (petition.lgpdText) payload.acceptedLgpd = acceptedLgpd;
    signMutation.mutate(payload);
  };

  return (
    <div className="min-h-screen bg-black">
      <div className="relative min-h-screen overflow-hidden">
        {petition.bannerUrl ? (
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${petition.bannerUrl})` }}>
            <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/90" />
          </div>
        ) : (
          <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom right, ${primaryColor}, ${primaryColor}cc, ${primaryColor}99)` }} />
        )}

        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full blur-3xl animate-pulse" style={{ animationDuration: "4s", backgroundColor: `${primaryColor}40` }} />
          <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full blur-3xl animate-pulse" style={{ animationDuration: "6s", animationDelay: "1s", backgroundColor: `${primaryColor}40` }} />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto px-4 py-16">
          {petition.videoUrl ? (
            <div className="flex justify-center mb-8">
              <div className="w-full max-w-lg">{renderVideo(petition.videoUrl)}</div>
            </div>
          ) : petition.logoUrl ? (
            <div className="flex justify-center mb-8">
              <img src={petition.logoUrl} alt={petition.title} className="max-w-xs md:max-w-sm rounded-md border-4 border-white/20 object-contain max-h-[300px]" data-testid="img-petition-logo" />
            </div>
          ) : null}

          <h1 className="font-black text-white mb-6 leading-tight text-center text-3xl md:text-5xl" data-testid="text-petition-title">
            {petition.title}
          </h1>

          <div className="max-w-3xl mx-auto mb-10 text-center">
            <p className="text-lg text-white/90 leading-relaxed whitespace-pre-line" data-testid="text-petition-description">
              {showFullDescription || petition.description.length <= 250
                ? petition.description
                : `${petition.description.slice(0, 250)}...`}
            </p>
            {petition.description.length > 250 && (
              <button
                onClick={() => setShowFullDescription(!showFullDescription)}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-white/10 hover:bg-white/20 border border-white/20 text-white/90 text-sm font-semibold"
                data-testid="button-toggle-description"
              >
                {showFullDescription ? <>Ver menos <ChevronUp className="w-4 h-4" /></> : <>Ler descrição completa <ChevronDown className="w-4 h-4" /></>}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 mb-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div className="text-left">
                <p className="text-2xl font-black text-white" data-testid="text-signatures-count">{petition.signaturesCount.toLocaleString("pt-BR")}</p>
                <p className="text-xs text-white/70">assinaturas</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                <Target className="w-6 h-6 text-white" />
              </div>
              <div className="text-left">
                <p className="text-2xl font-black text-white" data-testid="text-goal">{petition.goal.toLocaleString("pt-BR")}</p>
                <p className="text-xs text-white/70">meta</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-green-400" />
              </div>
              <div className="text-left">
                <p className="text-2xl font-black text-white" data-testid="text-progress">{progress.toFixed(0)}%</p>
                <p className="text-xs text-white/70">concluído</p>
              </div>
            </div>
          </div>

          <div className="max-w-2xl mx-auto mb-10">
            <div className="relative h-3 bg-white/10 rounded-full overflow-hidden border border-white/20">
              <div className="h-full bg-gradient-to-r from-green-400 to-teal-400 rounded-full transition-all duration-1000" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {/* Sign form */}
          <div className="max-w-xl mx-auto bg-white rounded-md p-6 shadow-2xl">
            {petition.status === "concluida" || petition.status === "pausada" ? (
              <p className="text-center text-slate-600" data-testid="text-petition-closed">
                Esta petição não está recebendo assinaturas no momento.
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-sign-petition">
                <h2 className="text-xl font-bold text-center" style={{ color: primaryColor }}>Assine esta petição</h2>

                <div className="space-y-2">
                  <Label htmlFor="sign-name" className={labelClass}>Nome completo *</Label>
                  <Input id="sign-name" className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required data-testid="input-name" />
                </div>

                {petition.collectEmail && (
                  <div className="space-y-2">
                    <Label htmlFor="sign-email" className={labelClass}>E-mail {petition.requireEmail ? "*" : ""}</Label>
                    <Input id="sign-email" className={inputClass} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-email" />
                  </div>
                )}

                {petition.collectPhone && (
                  <div className="space-y-2">
                    <Label htmlFor="sign-phone" className={labelClass}>Telefone {petition.requirePhone ? "*" : ""}</Label>
                    <Input id="sign-phone" className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="input-phone" />
                  </div>
                )}

                {(petition.collectCity || petition.collectState) && (
                  <div className="grid grid-cols-2 gap-3">
                    {petition.collectCity && (
                      <div className="space-y-2">
                        <Label htmlFor="sign-city" className={labelClass}>Cidade {petition.requireLocation ? "*" : ""}</Label>
                        <Input id="sign-city" className={inputClass} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} data-testid="input-city" />
                      </div>
                    )}
                    {petition.collectState && (
                      <div className="space-y-2">
                        <Label htmlFor="sign-state" className={labelClass}>Estado (UF) {petition.requireLocation ? "*" : ""}</Label>
                        <Input id="sign-state" className={inputClass} maxLength={2} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} data-testid="input-state" />
                      </div>
                    )}
                  </div>
                )}

                {petition.collectCpf && (
                  <div className="space-y-2">
                    <Label htmlFor="sign-cpf" className={labelClass}>CPF {petition.requireCpf ? "*" : ""}</Label>
                    <Input
                      id="sign-cpf"
                      className={inputClass}
                      value={form.cpf}
                      onChange={(e) => {
                        const f = formatCpf(e.target.value);
                        setForm({ ...form, cpf: f });
                        setCpfError(f.replace(/\D/g, "").length === 11 && !validateCpf(f) ? "CPF inválido" : "");
                      }}
                      data-testid="input-cpf"
                    />
                    {cpfError && <p className="text-sm font-medium text-red-600" data-testid="text-cpf-error">{cpfError}</p>}
                  </div>
                )}

                {petition.collectComment && (
                  <div className="space-y-2">
                    <Label htmlFor="sign-comment" className={labelClass}>Comentário {petition.requireComment ? "*" : ""}</Label>
                    <Textarea id="sign-comment" className={`${inputClass} min-h-24`} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} data-testid="input-comment" />
                  </div>
                )}

                <div className="flex items-start gap-2">
                  <Checkbox id="accept-terms" className={checkboxClass} checked={acceptedTerms} onCheckedChange={(v) => setAcceptedTerms(!!v)} data-testid="checkbox-terms" />
                  <Label htmlFor="accept-terms" className="text-sm font-normal leading-snug text-slate-700">
                    Declaro que as informações são verdadeiras e concordo em assinar esta petição.
                  </Label>
                </div>

                {petition.lgpdText && (
                  <div className="flex items-start gap-2">
                    <Checkbox id="accept-lgpd" className={checkboxClass} checked={acceptedLgpd} onCheckedChange={(v) => setAcceptedLgpd(!!v)} data-testid="checkbox-lgpd" />
                    <Label htmlFor="accept-lgpd" className="text-sm font-normal leading-snug text-slate-600">
                      {petition.lgpdText}
                    </Label>
                  </div>
                )}

                {formError && <p className="text-sm font-medium text-red-600 text-center" data-testid="text-form-error">{formError}</p>}

                <Button type="submit" className="w-full text-white hover:opacity-95" style={{ backgroundColor: primaryColor }} disabled={signMutation.isPending} data-testid="button-sign">
                  {signMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Assinar agora"}
                </Button>
              </form>
            )}

            <div className="mt-6 pt-4 border-t">
              <p className="text-sm text-slate-600 text-center mb-3 flex items-center justify-center gap-1.5">
                <Share2 className="w-4 h-4" /> Compartilhe esta petição
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {socialShares.map((s) => (
                  <Button key={s.name} type="button" size="icon" variant="outline" onClick={() => window.open(s.url, "_blank", "width=600,height=400")} data-testid={`button-share-${s.name.toLowerCase()}`}>
                    <span className="sr-only">Compartilhar no {s.name}</span>
                    <s.icon className="w-4 h-4" />
                  </Button>
                ))}
                <Button type="button" size="icon" variant="outline" onClick={handleCopy} data-testid="button-copy-link">
                  <span className="sr-only">Copiar link da petição</span>
                  <LinkIcon className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent data-testid="dialog-success">
          <div className="text-center py-6">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <DialogTitle className="text-xl font-bold mb-2">Assinatura confirmada!</DialogTitle>
            <p className="text-muted-foreground mb-6">Obrigado por apoiar esta causa. Compartilhe para alcançar mais pessoas.</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {socialShares.map((s) => (
                <Button key={s.name} type="button" size="icon" variant="outline" onClick={() => window.open(s.url, "_blank", "width=600,height=400")} data-testid={`button-success-share-${s.name.toLowerCase()}`}>
                  <span className="sr-only">Compartilhar no {s.name}</span>
                  <s.icon className="w-4 h-4" />
                </Button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
