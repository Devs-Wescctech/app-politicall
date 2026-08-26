import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CalendarPlus } from "lucide-react";
import type { AttConversation } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

function localDateTimeValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function defaultStart() {
  const date = new Date();
  date.setSeconds(0, 0);
  date.setMinutes(Math.ceil(date.getMinutes() / 30) * 30);
  if (date.getTime() <= Date.now()) date.setMinutes(date.getMinutes() + 30);
  return localDateTimeValue(date);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: AttConversation;
};

export default function FollowUpDialog({ open, onOpenChange, conversation }: Props) {
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(defaultStart);
  const [duration, setDuration] = useState("30");
  const [reminderMinutes, setReminderMinutes] = useState("15");
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setTitle(`Retorno - ${conversation.contactName ?? conversation.contactPhone ?? "Contato"}`);
    setStartDate(defaultStart());
    setDuration("30");
    setReminderMinutes("15");
  }, [open, conversation.id, conversation.contactName, conversation.contactPhone]);

  const mutation = useMutation({
    mutationFn: async () => {
      const start = new Date(startDate);
      const end = new Date(start.getTime() + Number(duration) * 60_000);
      const response = await apiRequest("POST", `/api/attendance/conversations/${conversation.id}/follow-up`, {
        title: title.trim() || undefined,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        reminderMinutes: Number(reminderMinutes),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({ title: "Retorno agendado", description: "O compromisso foi adicionado à Agenda." });
      onOpenChange(false);
    },
    onError: (error: Error) => toast({ title: "Erro ao agendar retorno", description: error.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-attendance-follow-up">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarPlus className="h-5 w-5 text-primary" /> Agendar retorno</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label htmlFor="follow-up-title" className="text-sm font-medium">Título</label>
            <Input id="follow-up-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={160} data-testid="input-follow-up-title" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="follow-up-date" className="text-sm font-medium">Data e hora</label>
            <Input id="follow-up-date" type="datetime-local" value={startDate} onChange={event => setStartDate(event.target.value)} data-testid="input-follow-up-date" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Duração</label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger data-testid="select-follow-up-duration"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutos</SelectItem>
                  <SelectItem value="30">30 minutos</SelectItem>
                  <SelectItem value="60">1 hora</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Lembrete</label>
              <Select value={reminderMinutes} onValueChange={setReminderMinutes}>
                <SelectTrigger data-testid="select-follow-up-reminder"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">No horário</SelectItem>
                  <SelectItem value="15">15 min antes</SelectItem>
                  <SelectItem value="30">30 min antes</SelectItem>
                  <SelectItem value="60">1 hora antes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={!startDate || mutation.isPending} data-testid="button-save-follow-up">
            {mutation.isPending ? "Agendando..." : "Adicionar à Agenda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
