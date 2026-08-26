import { Download, FileText, Paperclip, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

export type DemandAttachmentView = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  userName?: string | null;
};

type Props = {
  attachments: DemandAttachmentView[];
  loading: boolean;
  uploading: boolean;
  onUpload: (file: File) => void;
  onDownload: (attachment: DemandAttachmentView) => void;
  onDelete: (attachment: DemandAttachmentView) => void;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
export function DemandAttachments({ attachments, loading, uploading, onUpload, onDownload, onDelete }: Props) {
  return (
    <section className="space-y-4" aria-label="Anexos da demanda">
      <div className="rounded-md border border-dashed p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted"><Paperclip className="size-4" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Adicionar anexo</p>
            <p className="mt-1 text-xs text-muted-foreground">PDF, PNG, JPG ou WebP de ate 10 MB.</p>
            <label className="mt-3 inline-flex cursor-pointer">
              <input
                className="sr-only"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) onUpload(file);
                  event.currentTarget.value = "";
                }}
              />
              <span className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
                <Upload className="size-4" />{uploading ? "Enviando..." : "Selecionar arquivo"}
              </span>
            </label>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Carregando anexos...</p>
      ) : attachments.length === 0 ? (
        <div className="py-8 text-center"><FileText className="mx-auto size-7 text-muted-foreground" /><p className="mt-2 text-sm font-medium">Nenhum anexo nesta demanda</p></div>
      ) : (
        <ul className="divide-y rounded-md border">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="flex items-center gap-3 p-3">
              <FileText className="size-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{attachment.originalName}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(attachment.sizeBytes)}{attachment.userName ? ` · ${attachment.userName}` : ""}</p>
              </div>
              <Button size="icon" variant="ghost" title={`Baixar ${attachment.originalName}`} aria-label={`Baixar ${attachment.originalName}`} onClick={() => onDownload(attachment)}><Download className="size-4" /></Button>
              <Button size="icon" variant="ghost" title={`Excluir ${attachment.originalName}`} aria-label={`Excluir ${attachment.originalName}`} onClick={() => onDelete(attachment)}><Trash2 className="size-4 text-destructive" /></Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
