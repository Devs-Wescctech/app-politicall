import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { User, Phone, Mail, MapPin, StickyNote, Plus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { AttConversation, AttNote } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { TagSelector, labelColor, useAttendanceLabels } from "./TagSelector";

interface Props {
  conversation: AttConversation;
}

export default function ContactPanel({ conversation }: Props) {
  const [newNote, setNewNote] = useState("");
  const [editingContact, setEditingContact] = useState(false);
  const contactProfile = (conversation.metadata as any)?.contactProfile ?? {};
  const [contactForm, setContactForm] = useState({
    name: conversation.contactName ?? "",
    phone: conversation.contactPhone ?? "",
    email: conversation.contactEmail ?? "",
    city: contactProfile.city ?? "",
    state: contactProfile.state ?? "",
    notes: contactProfile.notes ?? "",
    tags: (conversation.tags ?? []).join(", "),
  });
  const { toast } = useToast();
  const { data: labels = [] } = useAttendanceLabels();

  const { data: convData } = useQuery<{ notes: AttNote[] }>({
    queryKey: ["/api/attendance/conversations", conversation.id],
  });

  const notes = convData?.notes ?? [];

  const addNoteMutation = useMutation({
    mutationFn: (note: string) =>
      apiRequest("POST", `/api/attendance/conversations/${conversation.id}/notes`, { note }),
    onSuccess: () => {
      setNewNote("");
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/conversations", conversation.id] });
      toast({ title: "Nota adicionada" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const saveContactMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/attendance/conversations/${conversation.id}/contact`, {
        ...contactForm,
        tags: contactForm.tags.split(",").map(tag => tag.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/conversations", conversation.id] });
      setEditingContact(false);
      toast({ title: "Contato salvo" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const priorityColors: Record<string, string> = {
    low: "bg-gray-400",
    normal: "bg-blue-500",
    high: "bg-orange-500",
    urgent: "bg-red-600",
  };
  const priorityLabels: Record<string, string> = {
    low: "Baixa",
    normal: "Normal",
    high: "Alta",
    urgent: "Urgente",
  };

  const initials = (conversation.contactName ?? "?").split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="flex max-h-[86vh] flex-col overflow-y-auto bg-background" data-testid="panel-contact">
      {/* Contact header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-3 mb-3">
          <Avatar className="w-11 h-11">
            <AvatarFallback className="text-sm font-medium">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">
              {conversation.contactName ?? "Desconhecido"}
            </p>
            <p className="text-xs text-muted-foreground truncate">{conversation.contactPhone ?? "–"}</p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setEditingContact(v => !v)}
            data-testid="button-edit-contact"
          >
            <User className="w-4 h-4" />
          </Button>
        </div>

        {/* Priority + protocol */}
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${priorityColors[conversation.priority ?? "normal"]}`} />
            <span className="text-xs text-muted-foreground">{priorityLabels[conversation.priority ?? "normal"]}</span>
          </div>
          {conversation.protocol && (
            <Badge variant="outline" className="text-xs h-5">
              {conversation.protocol}
            </Badge>
          )}
        </div>
      </div>

      {/* Contact edit form */}
      {editingContact && (
        <div className="p-4 border-b border-border bg-muted/30" data-testid="form-contact">
          <p className="text-xs font-medium text-foreground mb-3">Editar contato</p>
          <div className="space-y-2">
            {[
              { key: "name", label: "Nome", placeholder: "Nome completo" },
              { key: "phone", label: "Telefone", placeholder: "(00) 00000-0000" },
              { key: "email", label: "E-mail", placeholder: "email@exemplo.com" },
              { key: "city", label: "Cidade", placeholder: "Cidade" },
              { key: "state", label: "Estado", placeholder: "UF" },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
                <Input
                  value={(contactForm as any)[key]}
                  onChange={e => setContactForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="h-7 text-xs"
                  data-testid={`input-contact-${key}`}
                />
              </div>
            ))}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Etiquetas</label>
              <TagSelector
                selected={contactForm.tags.split(",").map(tag => tag.trim()).filter(Boolean)}
                onChange={tags => setContactForm(f => ({ ...f, tags: tags.join(", ") }))}
              />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={() => saveContactMutation.mutate()} disabled={saveContactMutation.isPending} data-testid="button-save-contact">
              Salvar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditingContact(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Contact info */}
      {!editingContact && (
        <div className="p-4 border-b border-border space-y-2">
          {conversation.contactPhone && (
            <div className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-sm text-foreground">{conversation.contactPhone}</span>
            </div>
          )}
          {conversation.contactEmail && (
            <div className="flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-sm text-foreground truncate">{conversation.contactEmail}</span>
            </div>
          )}
        </div>
      )}

      {/* Conversation details */}
      <div className="p-4 border-b border-border">
        <p className="text-xs font-medium text-foreground mb-2">Detalhes</p>
        <dl className="space-y-1.5">
          <div className="flex justify-between">
            <dt className="text-xs text-muted-foreground">Canal</dt>
            <dd className="text-xs text-foreground capitalize">{conversation.channel}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-xs text-muted-foreground">Status</dt>
            <dd className="text-xs text-foreground capitalize">{conversation.status}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-xs text-muted-foreground">Iniciado</dt>
            <dd className="text-xs text-foreground">
              {format(new Date(conversation.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
            </dd>
          </div>
          {conversation.summary && (
            <div className="mt-2">
              <dt className="text-xs text-muted-foreground mb-1">Resumo</dt>
              <dd className="text-xs text-foreground bg-muted rounded-md p-2">{conversation.summary}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Tags */}
      <div className="p-4 border-b border-border">
        <p className="text-xs font-medium text-foreground mb-2">Etiquetas</p>
        {conversation.tags && conversation.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {conversation.tags.map(tag => (
              <Badge
                key={tag}
                variant="secondary"
                className="h-5 border text-xs"
                style={{ borderColor: labelColor(labels, tag), backgroundColor: `${labelColor(labels, tag)}22`, color: labelColor(labels, tag) }}
              >
                {tag}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Nenhuma etiqueta ainda</p>
        )}
      </div>

      {/* Notes */}
      <div className="p-4 flex-1">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
            <StickyNote className="w-3.5 h-3.5" />
            Notas internas
          </p>
        </div>

        <div className="space-y-2 mb-3" data-testid="list-notes">
          {notes.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma nota ainda</p>
          ) : (
            notes.map(note => (
              <div key={note.id} data-testid={`note-${note.id}`} className="bg-muted rounded-md p-2.5">
                <p className="text-xs text-foreground whitespace-pre-wrap">{note.note}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {format(new Date(note.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                </p>
              </div>
            ))
          )}
        </div>

        <div className="space-y-2">
          <Textarea
            placeholder="Adicionar nota interna..."
            className="text-xs min-h-[60px] resize-none"
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            data-testid="input-new-note"
          />
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => addNoteMutation.mutate(newNote)}
            disabled={!newNote.trim() || addNoteMutation.isPending}
            data-testid="button-add-note"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar nota
          </Button>
        </div>
      </div>
    </div>
  );
}
