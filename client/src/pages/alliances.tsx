import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type PoliticalAlliance, type PoliticalParty, type InsertPoliticalAlliance, insertPoliticalAllianceSchema, type Contact, type AllianceInvite } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, Mail, MessageCircle, Edit, UserPlus, Users, TrendingUp, Send, Copy, Download, FileText, Sheet, Lock, CheckCircle2, X, Loader2, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import pdfMake from "pdfmake/build/pdfmake";
import * as pdfFonts from "pdfmake/build/vfs_fonts";
import * as XLSX from 'xlsx';
import logoUrl from "@assets/logo pol_1763308638963_1763559095972.png";

const IDEOLOGY_COLORS = {
  'Esquerda': '#ef4444',
  'Centro-Esquerda': '#f97316',
  'Centro': '#eab308',
  'Centro-Direita': '#3b82f6',
  'Direita': '#6366f1',
};

const IDEOLOGY_BADGES = {
  'Esquerda': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  'Centro-Esquerda': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'Centro': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  'Centro-Direita': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'Direita': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
};

const POLITICAL_POSITIONS = [
  { category: 'Executivo Federal', positions: ['Presidente da República', 'Vice-Presidente da República', 'Ministro de Estado'] },
  { category: 'Executivo Estadual', positions: ['Governador', 'Vice-Governador', 'Secretário Estadual'] },
  { category: 'Executivo Municipal', positions: ['Prefeito', 'Vice-Prefeito', 'Secretário Municipal'] },
  { category: 'Legislativo Federal', positions: ['Senador', 'Deputado Federal'] },
  { category: 'Legislativo Estadual', positions: ['Deputado Estadual', 'Deputado Distrital'] },
  { category: 'Legislativo Municipal', positions: ['Vereador'] },
];

const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

interface AllianceWithParty extends PoliticalAlliance {
  party?: PoliticalParty;
}

export default function Alliances() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedParty, setSelectedParty] = useState<PoliticalParty | null>(null);
  const [selectedAlliance, setSelectedAlliance] = useState<AllianceWithParty | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [stateFilter, setStateFilter] = useState<string>("");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [filterKey, setFilterKey] = useState(0);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  
  // Password protection states
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [exportPassword, setExportPassword] = useState("");
  const [isValidatingPassword, setIsValidatingPassword] = useState(false);
  const [pendingProtectedAction, setPendingProtectedAction] = useState<"pdf" | "excel" | "copy-whatsapp" | "bulk-email" | null>(null);
  
  // Invite modal
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  
  // Invite management modal
  const [isInviteManagementOpen, setIsInviteManagementOpen] = useState(false);
  
  // Bulk email with blocks
  const [isBulkEmailModalOpen, setIsBulkEmailModalOpen] = useState(false);
  const [sentEmailBlocks, setSentEmailBlocks] = useState<Set<number>>(() => {
    const saved = localStorage.getItem('sentAllianceEmailBlocks');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [sendingBlock, setSendingBlock] = useState<number | null>(null);
  const [bulkEmailSessionId, setBulkEmailSessionId] = useState<string>(() => {
    return localStorage.getItem('bulkAllianceEmailSessionId') || '';
  });
  const [emailBlockSize, setEmailBlockSize] = useState<number>(() => {
    const saved = localStorage.getItem('allianceEmailBlockSize');
    return saved ? parseInt(saved) : 30;
  });
  
  const { toast } = useToast();

  const { data: alliances, isLoading: loadingAlliances } = useQuery<AllianceWithParty[]>({
    queryKey: ["/api/alliances"],
  });

  const { data: parties, isLoading: loadingParties } = useQuery<PoliticalParty[]>({
    queryKey: ["/api/parties"],
  });

  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  // Buscar dados do admin da conta (usado para relatórios e exportações)
  const { data: adminData } = useQuery<any>({
    queryKey: ["/api/account/admin"],
  });

  // Buscar convites de aliança
  const { data: allianceInvites } = useQuery<AllianceInvite[]>({
    queryKey: ["/api/alliance-invites"],
  });

  // Função para obter contagens de convites por partido
  const getPartyInviteCounts = (partyId: string) => {
    if (!allianceInvites) return { pending: 0, accepted: 0, rejected: 0 };
    const partyInvites = allianceInvites.filter(i => i.partyId === partyId);
    return {
      pending: partyInvites.filter(i => i.status === 'pending').length,
      accepted: partyInvites.filter(i => i.status === 'accepted').length,
      rejected: partyInvites.filter(i => i.status === 'rejected').length,
    };
  };

  const form = useForm<InsertPoliticalAlliance>({
    resolver: zodResolver(insertPoliticalAllianceSchema),
    defaultValues: {
      partyId: "",
      allyName: "",
      position: "",
      state: "",
      city: "",
      phone: "",
      email: "",
      notes: "",
    },
  });

  const handleImportContact = (contactId: string) => {
    const contact = contacts?.find((c) => c.id === contactId);
    if (contact) {
      form.setValue("allyName", contact.name);
      form.setValue("phone", contact.phone || "");
      form.setValue("email", contact.email || "");
      form.setValue("notes", contact.notes || "");
      toast({ title: "Dados importados do contato!" });
    }
  };

  const createMutation = useMutation({
    mutationFn: (data: InsertPoliticalAlliance) => apiRequest("POST", "/api/alliances", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alliances"] });
      toast({ title: "Aliança criada com sucesso!" });
      setIsCreateDialogOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Erro ao criar aliança", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertPoliticalAlliance> }) =>
      apiRequest("PATCH", `/api/alliances/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alliances"] });
      toast({ title: "Aliado atualizado com sucesso!" });
      setSelectedAlliance(null);
      setIsEditMode(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Erro ao atualizar aliado", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/alliances/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alliances"] });
      toast({ title: "Aliado excluído com sucesso!" });
      setSelectedAlliance(null);
      setSelectedParty(null);
    },
    onError: () => {
      toast({ title: "Erro ao excluir aliado", variant: "destructive" });
    },
  });

  const createInviteMutation = useMutation({
    mutationFn: async (data: { partyId: string; inviteeName: string; inviteeEmail?: string; inviteePhone: string }) => {
      const response = await apiRequest("POST", "/api/alliance-invites", data);
      return response.json();
    },
    onSuccess: (invite: any) => {
      const link = `https://www.politicall.com.br/convite-alianca/${invite.token}`;
      setInviteLink(link);
      toast({ title: "Convite criado com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao criar convite", variant: "destructive" });
    },
  });

  const deleteInviteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/alliance-invites/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alliance-invites"] });
      toast({ title: "Convite excluído com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao excluir convite", variant: "destructive" });
    },
  });

  const handleCreateInvite = () => {
    if (!selectedParty) return;
    if (!inviteName.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    if (!invitePhone.trim()) {
      toast({ title: "WhatsApp é obrigatório", variant: "destructive" });
      return;
    }
    createInviteMutation.mutate({
      partyId: selectedParty.id,
      inviteeName: inviteName.trim(),
      inviteeEmail: inviteEmail || undefined,
      inviteePhone: invitePhone.trim(),
    });
  };

  const handleCopyInviteLink = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink).then(() => {
        toast({ title: "Link copiado!" });
      });
    }
  };

  const handleSendInviteByEmail = () => {
    if (!inviteLink || !selectedParty) return;
    const subject = encodeURIComponent(`Convite para Aliança Política - ${selectedParty.acronym}`);
    const body = encodeURIComponent(`Olá!\n\nVocê foi convidado(a) para fazer parte da nossa aliança política pelo partido ${selectedParty.acronym} - ${selectedParty.name}.\n\nClique no link abaixo para aceitar o convite:\n${inviteLink}\n\nAtenciosamente,\nEquipe Politicall`);
    window.location.href = `mailto:${inviteEmail}?subject=${subject}&body=${body}`;
  };

  const handleSendInviteByWhatsApp = () => {
    if (!inviteLink || !selectedParty) return;
    const cleanPhone = invitePhone.replace(/\D/g, "");
    const internationalPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
    const message = encodeURIComponent(`Olá! Você foi convidado(a) para fazer parte da nossa aliança política pelo partido ${selectedParty.acronym} - ${selectedParty.name}.\n\nClique no link para aceitar o convite:\n${inviteLink}`);
    window.open(`https://wa.me/${internationalPhone}?text=${message}`, "_blank");
  };

  const handleCloseInviteModal = () => {
    setIsInviteModalOpen(false);
    setInviteLink(null);
    setInviteName("");
    setInviteEmail("");
    setInvitePhone("");
  };

  const handleSubmit = (data: InsertPoliticalAlliance) => {
    if (isEditMode && selectedAlliance) {
      updateMutation.mutate({ id: selectedAlliance.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Tem certeza que deseja excluir este aliado?")) {
      deleteMutation.mutate(id);
    }
  };

  const handlePartyClick = (party: PoliticalParty) => {
    setSelectedParty(party);
  };

  const handleAllianceClick = (alliance: AllianceWithParty) => {
    setSelectedAlliance(alliance);
    setIsEditMode(false);
  };

  const handleEditClick = () => {
    if (selectedAlliance) {
      form.reset({
        partyId: selectedAlliance.partyId,
        allyName: selectedAlliance.allyName,
        position: selectedAlliance.position || "",
        state: selectedAlliance.state || "",
        city: selectedAlliance.city || "",
        phone: selectedAlliance.phone || "",
        email: selectedAlliance.email || "",
        notes: selectedAlliance.notes || "",
      });
      setIsEditMode(true);
    }
  };

  const getFilteredAlliances = () => {
    if (!alliances) return [];
    return alliances.filter((alliance) => {
      const matchesState = !stateFilter || alliance.state === stateFilter;
      const matchesCity = !cityFilter || alliance.city === cityFilter;
      return matchesState && matchesCity;
    });
  };

  const getPartyAllianceCount = (partyId: string) => {
    return getFilteredAlliances().filter((a) => a.partyId === partyId).length;
  };

  const getPartyAlliances = (partyId: string) => {
    return getFilteredAlliances().filter((a) => a.partyId === partyId);
  };

  const handleEmailClick = (email: string) => {
    window.location.href = `mailto:${email}`;
  };

  const handleWhatsAppClick = (phone: string) => {
    const cleanPhone = phone.replace(/\D/g, "");
    const internationalPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
    window.open(`https://wa.me/${internationalPhone}`, "_blank");
  };

  const getTotalAlliances = () => {
    return getFilteredAlliances().length;
  };

  const getDominantIdeology = () => {
    const filtered = getFilteredAlliances();
    if (!parties || filtered.length === 0) return null;
    
    const ideologyCounts: { [key: string]: number } = {};
    
    filtered.forEach((alliance) => {
      const party = parties.find((p) => p.id === alliance.partyId);
      if (party) {
        ideologyCounts[party.ideology] = (ideologyCounts[party.ideology] || 0) + 1;
      }
    });
    
    let maxCount = 0;
    let dominantIdeology = "";
    
    Object.entries(ideologyCounts).forEach(([ideology, count]) => {
      if (count > maxCount) {
        maxCount = count;
        dominantIdeology = ideology;
      }
    });
    
    return dominantIdeology || null;
  };

  const getUniqueCities = () => {
    if (!alliances) return [];
    const cities = alliances
      .map((a) => a.city)
      .filter((city): city is string => Boolean(city));
    return Array.from(new Set(cities)).sort();
  };

  const getFilteredCities = () => {
    if (!alliances) return [];
    const filtered = stateFilter 
      ? alliances.filter((a) => a.state === stateFilter)
      : alliances;
    const cities = filtered
      .map((a) => a.city)
      .filter((city): city is string => Boolean(city));
    return Array.from(new Set(cities)).sort();
  };

  const getUniqueStates = () => {
    if (!alliances) return [];
    const states = alliances
      .map((a) => a.state)
      .filter((state): state is string => Boolean(state));
    return Array.from(new Set(states)).sort();
  };

  const capitalizeWords = (str: string) => {
    return str
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Password protection functions
  const requestProtectedAction = (type: "pdf" | "excel" | "copy-whatsapp" | "bulk-email") => {
    setPendingProtectedAction(type);
    setExportPassword("");
    setIsPasswordDialogOpen(true);
  };

  const validatePasswordAndExecute = async () => {
    if (!exportPassword.trim()) {
      toast({ title: "Digite a senha do administrador", variant: "destructive" });
      return;
    }

    setIsValidatingPassword(true);
    try {
      const response = await apiRequest("POST", "/api/auth/validate-admin-password", { password: exportPassword });
      const result = await response.json();
      
      if (!response.ok) {
        toast({ 
          title: "Senha incorreta", 
          description: result.error || "A senha do administrador está incorreta.",
          variant: "destructive" 
        });
        return;
      }
      
      if (result.valid) {
        setIsPasswordDialogOpen(false);
        setExportPassword("");
        
        switch (pendingProtectedAction) {
          case "pdf":
            await executeExportPDF();
            break;
          case "excel":
            await executeExportExcel();
            break;
          case "copy-whatsapp":
            executeCopyWhatsAppNumbers();
            break;
          case "bulk-email":
            executeBulkEmail();
            break;
        }
        setPendingProtectedAction(null);
      }
    } catch (error: any) {
      toast({ 
        title: "Erro de conexão", 
        description: "Não foi possível validar a senha. Tente novamente.",
        variant: "destructive" 
      });
    } finally {
      setIsValidatingPassword(false);
    }
  };

  const handleBulkEmail = () => {
    requestProtectedAction("bulk-email");
  };

  // Email blocks calculation - divide alliances with email into chunks based on selected block size
  const emailBlocks = useMemo(() => {
    const alliancesWithEmail = getFilteredAlliances().filter(a => a.email);
    const blocks: { emails: string[]; startIndex: number; endIndex: number }[] = [];
    
    // Se blockSize é 0, significa "sem limites" - todos em um único bloco
    if (emailBlockSize === 0) {
      if (alliancesWithEmail.length > 0) {
        blocks.push({
          emails: alliancesWithEmail.map(a => a.email!),
          startIndex: 1,
          endIndex: alliancesWithEmail.length
        });
      }
      return blocks;
    }
    
    for (let i = 0; i < alliancesWithEmail.length; i += emailBlockSize) {
      const chunk = alliancesWithEmail.slice(i, i + emailBlockSize);
      blocks.push({
        emails: chunk.map(a => a.email!),
        startIndex: i + 1,
        endIndex: Math.min(i + emailBlockSize, alliancesWithEmail.length)
      });
    }
    return blocks;
  }, [alliances, stateFilter, cityFilter, emailBlockSize]);

  // Handle block size change - reset sent blocks
  const handleAllianceBlockSizeChange = (value: string) => {
    const newSize = parseInt(value);
    setEmailBlockSize(newSize);
    localStorage.setItem('allianceEmailBlockSize', value);
    setSentEmailBlocks(new Set());
    localStorage.setItem('sentAllianceEmailBlocks', JSON.stringify([]));
  };

  // Generate a unique session ID based on alliances for tracking
  const currentEmailSessionId = useMemo(() => {
    const alliancesWithEmail = getFilteredAlliances().filter(a => a.email);
    if (alliancesWithEmail.length === 0) return '';
    const emailList = alliancesWithEmail.map(a => a.email).sort().join(',');
    let hash = 0;
    for (let i = 0; i < emailList.length; i++) {
      const char = emailList.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `alliance_session_${Math.abs(hash)}`;
  }, [alliances, stateFilter, cityFilter]);

  // Reset sent blocks if session changed (different alliance list)
  const checkAndResetSession = () => {
    if (bulkEmailSessionId !== currentEmailSessionId) {
      setSentEmailBlocks(new Set());
      setBulkEmailSessionId(currentEmailSessionId);
      localStorage.setItem('bulkAllianceEmailSessionId', currentEmailSessionId);
      localStorage.setItem('sentAllianceEmailBlocks', JSON.stringify([]));
    }
  };

  const executeBulkEmail = () => {
    const alliancesWithEmail = getFilteredAlliances().filter(a => a.email);
    if (alliancesWithEmail.length === 0) {
      toast({ title: "Nenhum aliado com email", variant: "destructive" });
      return;
    }
    checkAndResetSession();
    setIsBulkEmailModalOpen(true);
  };

  const sendEmailBlock = (blockIndex: number) => {
    if (sentEmailBlocks.has(blockIndex)) {
      toast({ title: "Este bloco já foi enviado", variant: "destructive" });
      return;
    }

    const block = emailBlocks[blockIndex];
    if (!block) return;

    setSendingBlock(blockIndex);
    
    // Open mailto with BCC for this block
    const emailAddresses = block.emails.join(',');
    window.location.href = `mailto:?bcc=${emailAddresses}`;
    
    // Mark block as sent after a short delay - using functional update to avoid stale closure
    setTimeout(() => {
      setSentEmailBlocks(prevBlocks => {
        const newSentBlocks = new Set(prevBlocks);
        newSentBlocks.add(blockIndex);
        localStorage.setItem('sentAllianceEmailBlocks', JSON.stringify(Array.from(newSentBlocks)));
        return newSentBlocks;
      });
      setSendingBlock(null);
      
      toast({ 
        title: "Bloco enviado!", 
        description: `Bloco ${blockIndex + 1} de ${emailBlocks.length} marcado como enviado`
      });
    }, 1000);
  };

  const resetEmailBlocks = () => {
    setSentEmailBlocks(new Set());
    localStorage.setItem('sentAllianceEmailBlocks', JSON.stringify([]));
    toast({ title: "Progresso resetado", description: "Todos os blocos foram marcados como pendentes" });
  };

  const handleCopyWhatsAppNumbers = () => {
    requestProtectedAction("copy-whatsapp");
  };

  const executeCopyWhatsAppNumbers = () => {
    const phones = getFilteredAlliances()
      .filter(a => a.phone)
      .map(a => {
        const cleanPhone = a.phone!.replace(/\D/g, '');
        const internationalPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
        return `+${internationalPhone}`;
      })
      .join('\n');
    
    if (!phones) {
      toast({ title: "Nenhum aliado com telefone", variant: "destructive" });
      return;
    }

    navigator.clipboard.writeText(phones).then(() => {
      toast({ 
        title: "Números copiados!", 
        description: `${phones.split('\n').length} números formatados para WhatsApp Business API`
      });
    }).catch(() => {
      toast({ title: "Erro ao copiar números", variant: "destructive" });
    });
  };

  const handleExportPDF = () => {
    requestProtectedAction("pdf");
  };

  const executeExportPDF = async () => {
    const filteredAlliances = getFilteredAlliances();
    if (!filteredAlliances || filteredAlliances.length === 0) {
      toast({ title: "Nenhuma aliança para exportar", variant: "destructive" });
      return;
    }

    // Converter logo para base64
    const logoBase64 = await fetch(logoUrl)
      .then(res => res.blob())
      .then(blob => new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      }));

    const adminName = adminData?.name || 'Administrador';
    const adminParty = adminData?.party ? `${adminData.party.acronym} - ${adminData.party.name}` : 'Sem partido';
    const adminPhone = adminData?.phone || 'Não informado';
    const adminEmail = adminData?.email || 'Não informado';

    const docDefinition: any = {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [40, 100, 40, 60],
      header: {
        margin: [40, 20, 40, 0],
        columns: [
          {
            image: logoBase64,
            width: 50,
            alignment: 'left'
          },
          {
            stack: [
              { text: 'RELATÓRIO DE ALIANÇAS POLÍTICAS', style: 'header' },
              { text: `Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, style: 'subheader' }
            ],
            alignment: 'right'
          }
        ]
      },
      footer: function(currentPage: number, pageCount: number) {
        return {
          margin: [40, 0],
          columns: [
            { text: adminName, style: 'adminName' },
            { text: `Página ${currentPage} de ${pageCount}`, alignment: 'right', style: 'adminInfo' }
          ]
        };
      },
      content: [
        { text: 'Informações do Responsável', style: 'sectionTitle' },
        {
          columns: [
            { text: `Nome: ${adminName}`, style: 'adminInfo' },
            { text: `Partido: ${adminParty}`, style: 'adminInfo' }
          ]
        },
        {
          columns: [
            { text: `Telefone: ${adminPhone}`, style: 'adminInfo' },
            { text: `Email: ${adminEmail}`, style: 'adminInfo' }
          ]
        },
        { text: '', margin: [0, 10] },
        { text: `Total de alianças: ${filteredAlliances.length}`, style: 'sectionTitle' },
        { text: '', margin: [0, 5] },
        {
          table: {
            headerRows: 1,
            widths: ['*', 'auto', '*', 'auto', 'auto', 'auto', '*'],
            body: [
              [
                { text: 'Nome', style: 'tableHeader' },
                { text: 'Partido', style: 'tableHeader' },
                { text: 'Cargo', style: 'tableHeader' },
                { text: 'Estado', style: 'tableHeader' },
                { text: 'Cidade', style: 'tableHeader' },
                { text: 'Telefone', style: 'tableHeader' },
                { text: 'Email', style: 'tableHeader' }
              ],
              ...filteredAlliances.map(alliance => {
                const party = parties?.find(p => p.id === alliance.partyId);
                return [
                  alliance.allyName,
                  party?.acronym || '-',
                  alliance.position || '-',
                  alliance.state || '-',
                  alliance.city || '-',
                  alliance.phone || '-',
                  alliance.email || '-'
                ];
              })
            ]
          },
          layout: {
            fillColor: function (rowIndex: number) {
              return rowIndex === 0 ? '#40E0D0' : (rowIndex % 2 === 0 ? '#f3f4f6' : null);
            },
            hLineWidth: function () { return 0.5; },
            vLineWidth: function () { return 0.5; },
            hLineColor: function () { return '#e5e7eb'; },
            vLineColor: function () { return '#e5e7eb'; }
          }
        }
      ],
      styles: {
        header: {
          fontSize: 14,
          bold: true,
          color: '#1f2937'
        },
        subheader: {
          fontSize: 10,
          color: '#6b7280'
        },
        sectionTitle: {
          fontSize: 11,
          bold: true,
          color: '#1f2937',
          margin: [0, 5, 0, 5]
        },
        tableHeader: {
          bold: true,
          fontSize: 8,
          color: 'white'
        },
        adminName: {
          fontSize: 12,
          bold: true,
          color: '#1f2937',
          margin: [0, 0, 0, 3]
        },
        adminInfo: {
          fontSize: 8,
          color: '#6b7280',
          margin: [0, 0, 0, 2]
        }
      },
      defaultStyle: {
        fontSize: 7
      }
    };

    pdfMake.createPdf(docDefinition).download(`aliancas-${new Date().toISOString().split('T')[0]}.pdf`);
    toast({ title: `PDF gerado com ${filteredAlliances.length} alianças!` });
    setIsExportDialogOpen(false);
  };

  const handleExportExcel = () => {
    requestProtectedAction("excel");
  };

  const executeExportExcel = async () => {
    const filteredAlliances = getFilteredAlliances();
    if (!filteredAlliances || filteredAlliances.length === 0) {
      toast({ title: "Nenhuma aliança para exportar", variant: "destructive" });
      return;
    }

    const adminName = adminData?.name || 'Administrador';
    const adminParty = adminData?.party ? `${adminData.party.acronym} - ${adminData.party.name}` : 'Sem partido';
    const adminPhone = adminData?.phone || 'Não informado';
    const adminEmail = adminData?.email || 'Não informado';

    // Criar dados da planilha
    const worksheetData = [
      ['RELATÓRIO DE ALIANÇAS POLÍTICAS'],
      [],
      ['Responsável:', adminName],
      ['Partido:', adminParty],
      ['Telefone:', adminPhone],
      ['Email:', adminEmail],
      [],
      [`Total de alianças: ${filteredAlliances.length}`],
      [],
      ['Nome', 'Partido', 'Cargo', 'Estado', 'Cidade', 'Telefone', 'Email', 'Observações'],
      ...filteredAlliances.map(alliance => {
        const party = parties?.find(p => p.id === alliance.partyId);
        return [
          alliance.allyName,
          party?.acronym || '-',
          alliance.position || '-',
          alliance.state || '-',
          alliance.city || '-',
          alliance.phone || '-',
          alliance.email || '-',
          alliance.notes || '-'
        ];
      })
    ];

    // Criar workbook e worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(worksheetData);

    // Definir larguras das colunas
    ws['!cols'] = [
      { wch: 30 }, // Nome
      { wch: 15 }, // Partido
      { wch: 25 }, // Cargo
      { wch: 10 }, // Estado
      { wch: 20 }, // Cidade
      { wch: 18 }, // Telefone
      { wch: 30 }, // Email
      { wch: 40 }  // Observações
    ];

    // Mesclar células para o título
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }, // Título principal
    ];

    // Adicionar worksheet ao workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Alianças');

    // Baixar arquivo
    XLSX.writeFile(wb, `aliancas-${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: `Excel gerado com ${filteredAlliances.length} alianças!` });
    setIsExportDialogOpen(false);
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Aliança Política</h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select 
            key={`state-${filterKey}`}
            value={stateFilter || undefined} 
            onValueChange={(value) => {
              setStateFilter(value);
              setCityFilter("");
              setFilterKey(prev => prev + 1);
            }}
          >
            <SelectTrigger className="w-[180px] rounded-full" data-testid="select-filter-state">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              {getUniqueStates().map((state) => (
                <SelectItem key={state} value={state}>
                  {state}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select 
            key={`city-${filterKey}`}
            value={cityFilter || undefined} 
            onValueChange={setCityFilter}
          >
            <SelectTrigger className="w-[180px] rounded-full" data-testid="select-filter-city">
              <SelectValue placeholder="Cidade" />
            </SelectTrigger>
            <SelectContent>
              {getFilteredCities().map((city) => (
                <SelectItem key={city} value={city}>
                  {city}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(stateFilter || cityFilter) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStateFilter("");
                setCityFilter("");
                setFilterKey(prev => prev + 1);
              }}
              className="rounded-full"
              data-testid="button-clear-filters"
            >
              Limpar Filtros
            </Button>
          )}

          <Button 
            size="icon"
            variant="outline"
            onClick={handleBulkEmail}
            data-testid="button-bulk-email"
            title="Enviar email em massa"
          >
            <Send className="w-4 h-4" />
          </Button>
          
          <Button 
            size="icon"
            variant="outline"
            onClick={handleCopyWhatsAppNumbers}
            data-testid="button-copy-whatsapp"
            title="Copiar números para WhatsApp Business"
          >
            <Copy className="w-4 h-4" />
          </Button>

          <Button 
            size="icon"
            variant="outline"
            onClick={() => setIsExportDialogOpen(true)}
            data-testid="button-export-alliances"
            title="Exportar alianças"
          >
            <Download className="w-4 h-4" />
          </Button>

          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-alliance" className="rounded-full">
                <Plus className="w-4 h-4 mr-2" />
                Nova Aliança
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b">
              <DialogTitle>Nova Aliança</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col flex-1 overflow-hidden">
                <div className="overflow-y-auto px-6 py-4 space-y-4">
                  <FormField
                    control={form.control}
                    name="partyId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Partido *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-party">
                              <SelectValue placeholder="Selecione o partido" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {parties?.map((party) => (
                              <SelectItem key={party.id} value={party.id}>
                                {party.acronym} - {party.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="flex items-center gap-4">
                    <div className="flex-1 border-t" />
                    <span className="text-xs text-muted-foreground">x</span>
                    <div className="flex-1 border-t" />
                  </div>

                  <div>
                    <label className="text-sm font-medium">Importar de Contatos (opcional)</label>
                    <Select onValueChange={handleImportContact}>
                      <SelectTrigger data-testid="select-import-contact" className="mt-2">
                        <SelectValue placeholder="Selecione um contato" />
                      </SelectTrigger>
                      <SelectContent>
                        {contacts?.map((contact) => (
                          <SelectItem key={contact.id} value={contact.id}>
                            {contact.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex-1 border-t" />
                  </div>

                  <FormField
                    control={form.control}
                    name="allyName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome do Aliado *</FormLabel>
                        <FormControl>
                          <Input placeholder="Nome completo" data-testid="input-ally-name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="position"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cargo</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-position">
                              <SelectValue placeholder="Selecione o cargo" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {POLITICAL_POSITIONS.map((group) => (
                              <div key={group.category}>
                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                  {group.category}
                                </div>
                                {group.positions.map((position) => (
                                  <SelectItem key={position} value={position}>
                                    {position}
                                  </SelectItem>
                                ))}
                              </div>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estado</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-state">
                              <SelectValue placeholder="Selecione o estado" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {BRAZILIAN_STATES.map((state) => (
                              <SelectItem key={state} value={state}>
                                {state}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cidade</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Nome da cidade"
                            data-testid="input-city"
                            list="cities-list"
                            {...field}
                            onChange={(e) => {
                              const formatted = capitalizeWords(e.target.value);
                              field.onChange(formatted);
                            }}
                          />
                        </FormControl>
                        <datalist id="cities-list">
                          {getUniqueCities().map((city) => (
                            <option key={city} value={city} />
                          ))}
                        </datalist>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Telefone</FormLabel>
                        <FormControl>
                          <Input placeholder="(00) 00000-0000" data-testid="input-ally-phone" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="email@exemplo.com" data-testid="input-ally-email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Observações</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Notas adicionais" data-testid="input-ally-notes" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <DialogFooter className="px-6 py-4 border-t grid grid-cols-1 gap-2">
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-alliance" className="rounded-full w-full">
                    {createMutation.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
          <DialogContent className="max-w-md p-0" aria-describedby="export-dialog-description">
            <DialogHeader className="px-5 pt-5 pb-3 border-b">
              <DialogTitle className="text-xl font-bold">Exportar Alianças</DialogTitle>
              <p id="export-dialog-description" className="text-xs text-muted-foreground mt-1">
                Selecione o formato para exportar os dados das alianças políticas
              </p>
            </DialogHeader>
            <div className="p-4">
              <div className="grid gap-3">
                <Card 
                  className="cursor-pointer transition-all hover-elevate active-elevate-2 border-2 hover:border-primary/20"
                  onClick={handleExportPDF}
                  data-testid="button-export-pdf"
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                        <FileText className="h-5 w-5 text-red-600 dark:text-red-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold mb-0.5">Exportar como PDF</h3>
                        <p className="text-xs text-muted-foreground leading-snug">
                          Documento formatado com todas as alianças prontas para apresentação
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card 
                  className="cursor-pointer transition-all hover-elevate active-elevate-2 border-2 hover:border-primary/20"
                  onClick={handleExportExcel}
                  data-testid="button-export-excel"
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                        <Sheet className="h-5 w-5 text-green-600 dark:text-green-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold mb-0.5">Exportar como Excel</h3>
                        <p className="text-xs text-muted-foreground leading-snug">
                          Planilha editável com todos os dados para análise detalhada
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Aliados</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-alliances">
              {getTotalAlliances()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {getTotalAlliances() === 1 ? "aliado cadastrado" : "aliados cadastrados"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ideologia Dominante</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {getDominantIdeology() ? (
              <>
                <div className="text-2xl font-bold" data-testid="text-dominant-ideology">
                  {getDominantIdeology()}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  maioria dos aliados
                </p>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold">-</div>
                <p className="text-xs text-muted-foreground mt-1">
                  nenhum aliado cadastrado
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      {loadingParties ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {[...Array(29)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {parties
            ?.slice()
            .sort((a, b) => {
              const countA = getPartyAllianceCount(a.id);
              const countB = getPartyAllianceCount(b.id);
              return countB - countA;
            })
            .map((party) => {
              const count = getPartyAllianceCount(party.id);
              const inviteCounts = getPartyInviteCounts(party.id);
              const hasInvites = inviteCounts.pending > 0 || inviteCounts.accepted > 0 || inviteCounts.rejected > 0;
              const isInactive = count === 0 && !hasInvites;
              return (
                <Card
                  key={party.id}
                  className={`cursor-pointer hover-elevate transition-all ${isInactive ? 'opacity-40' : ''}`}
                  onClick={() => handlePartyClick(party)}
                  data-testid={`party-card-${party.acronym}`}
                  style={{ borderTop: `4px solid ${IDEOLOGY_COLORS[party.ideology as keyof typeof IDEOLOGY_COLORS]}` }}
                >
                  <CardContent className="p-4 flex flex-col items-center justify-center text-center min-h-[120px] relative">
                    <div className="absolute top-2 right-2">
                      <div
                        className={`rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold ${
                          count === 0 
                            ? 'bg-muted text-muted-foreground' 
                            : 'bg-primary text-primary-foreground'
                        }`}
                        data-testid={`party-count-${party.acronym}`}
                      >
                        {count}
                      </div>
                    </div>
                    <h3 className="font-bold text-lg mb-1 truncate max-w-full">
                      {party.acronym.length > 4 ? `${party.acronym.substring(0, 4)}...` : party.acronym}
                    </h3>
                    <p className="text-xs text-muted-foreground line-clamp-2">{party.name}</p>
                    {hasInvites && (
                      <div className="mt-2 pt-2 border-t w-full flex justify-center gap-3" data-testid={`party-invites-${party.acronym}`}>
                        {inviteCounts.pending > 0 && (
                          <span className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400" title="Convites enviados (pendentes)">
                            <Clock className="w-3 h-3" />
                            {inviteCounts.pending}
                          </span>
                        )}
                        {inviteCounts.accepted > 0 && (
                          <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400" title="Convites aceitos">
                            <CheckCircle2 className="w-3 h-3" />
                            {inviteCounts.accepted}
                          </span>
                        )}
                        {inviteCounts.rejected > 0 && (
                          <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400" title="Convites rejeitados">
                            <X className="w-3 h-3" />
                            {inviteCounts.rejected}
                          </span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
        </div>
      )}
      <Dialog open={!!selectedParty} onOpenChange={(open) => !open && setSelectedParty(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-0 overflow-hidden [&>button]:hidden">
          <DialogHeader className="border-b p-0">
            <div className="flex items-center">
              <div className="flex-1 px-6 py-4">
                <DialogTitle className="flex items-center gap-3">
                  <span className="text-xl font-bold">{selectedParty?.acronym}</span>
                  <span className="text-xs text-muted-foreground">
                    {selectedParty?.ideology}
                  </span>
                </DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">{selectedParty?.name}</p>
              </div>
              <div className="flex items-center gap-2 px-4">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={handleCopyWhatsAppNumbers}
                  data-testid="button-copy-whatsapp-party-modal"
                  title="Copiar números WhatsApp"
                  className="rounded-full"
                >
                  <Copy className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={handleBulkEmail}
                  data-testid="button-bulk-email-party-modal"
                  title="Enviar email em massa"
                  className="rounded-full"
                >
                  <Send className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setIsInviteManagementOpen(true)}
                  data-testid="button-manage-invites-party-modal"
                  title="Gerenciar convites"
                  className="rounded-full"
                >
                  <Users className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="overflow-y-auto px-6 py-4 flex-1">
            <div className="space-y-3">
              {selectedParty && getPartyAlliances(selectedParty.id).length > 0 ? (
                getPartyAlliances(selectedParty.id).map((alliance) => (
                  <div
                    key={alliance.id}
                    className="p-4 border rounded-lg hover-elevate flex items-center justify-between gap-4"
                    data-testid={`alliance-item-${alliance.id}`}
                  >
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => handleAllianceClick(alliance)}
                    >
                      <h4 className="font-semibold">{alliance.allyName}</h4>
                      {alliance.position && (
                        <p className="text-sm text-muted-foreground">{alliance.position}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {alliance.email && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEmailClick(alliance.email!);
                          }}
                          data-testid={`button-email-${alliance.id}`}
                          className="rounded-full"
                        >
                          <Mail className="w-4 h-4" />
                        </Button>
                      )}
                      {alliance.phone && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleWhatsAppClick(alliance.phone!);
                          }}
                          data-testid={`button-whatsapp-${alliance.id}`}
                          className="rounded-full"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  Nenhum aliado cadastrado neste partido.
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="p-4 border-t flex flex-col gap-2 sm:flex-row">
            <Button
              variant="default"
              className="rounded-full flex-1"
              onClick={() => setIsInviteModalOpen(true)}
              data-testid="button-send-invite"
            >
              <Send className="w-4 h-4 mr-2" />
              Enviar Convite
            </Button>
            <DialogClose asChild>
              <Button
                variant="outline"
                className="rounded-full flex-1"
                data-testid="button-close-party-modal"
              >
                Fechar
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!selectedAlliance && !isEditMode} onOpenChange={(open) => !open && setSelectedAlliance(null)}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle>{selectedAlliance?.allyName}</DialogTitle>
            {selectedAlliance?.position && (
              <p className="text-sm text-muted-foreground">{selectedAlliance.position}</p>
            )}
          </DialogHeader>
          <div className="overflow-y-auto px-6 py-4 flex-1">
            <div className="space-y-4">
              {selectedAlliance?.party && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Partido</label>
                  <div className="mt-1">
                    <Badge className={`rounded-full ${IDEOLOGY_BADGES[selectedAlliance.party.ideology as keyof typeof IDEOLOGY_BADGES]}`}>
                      {selectedAlliance.party.acronym} - {selectedAlliance.party.ideology}
                    </Badge>
                  </div>
                </div>
              )}
              {selectedAlliance?.state && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Estado</label>
                  <p className="text-base mt-1">{selectedAlliance.state}</p>
                </div>
              )}
              {selectedAlliance?.city && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Cidade</label>
                  <p className="text-base mt-1">{selectedAlliance.city}</p>
                </div>
              )}
              {selectedAlliance?.phone && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Telefone</label>
                  <p className="text-base mt-1">{selectedAlliance.phone}</p>
                </div>
              )}
              {selectedAlliance?.email && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Email</label>
                  <p className="text-base mt-1">{selectedAlliance.email}</p>
                </div>
              )}
              {selectedAlliance?.notes && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Observações</label>
                  <p className="text-base mt-1">{selectedAlliance.notes}</p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={handleEditClick}
              data-testid="button-edit-alliance"
              className="rounded-full w-full"
            >
              <Edit className="w-4 h-4 mr-2" />
              Editar
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedAlliance && handleDelete(selectedAlliance.id)}
              data-testid="button-delete-alliance"
              className="rounded-full w-full"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isEditMode} onOpenChange={(open) => {
        if (!open) {
          setIsEditMode(false);
          form.reset();
        }
      }}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle>Editar Aliado</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col flex-1 overflow-hidden">
              <div className="overflow-y-auto px-6 py-4 space-y-4">
                <FormField
                  control={form.control}
                  name="partyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Partido *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-party">
                            <SelectValue placeholder="Selecione o partido" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {parties?.map((party) => (
                            <SelectItem key={party.id} value={party.id}>
                              {party.acronym} - {party.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="allyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome do Aliado *</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome completo" data-testid="input-edit-ally-name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="position"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cargo</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-position">
                            <SelectValue placeholder="Selecione o cargo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {POLITICAL_POSITIONS.map((group) => (
                            <div key={group.category}>
                              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                {group.category}
                              </div>
                              {group.positions.map((position) => (
                                <SelectItem key={position} value={position}>
                                  {position}
                                </SelectItem>
                              ))}
                            </div>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estado</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-state">
                            <SelectValue placeholder="Selecione o estado" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {BRAZILIAN_STATES.map((state) => (
                            <SelectItem key={state} value={state}>
                              {state}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cidade</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Nome da cidade"
                          data-testid="input-edit-city"
                          list="cities-list-edit"
                          {...field}
                          onChange={(e) => {
                            const formatted = capitalizeWords(e.target.value);
                            field.onChange(formatted);
                          }}
                        />
                      </FormControl>
                      <datalist id="cities-list-edit">
                        {getUniqueCities().map((city) => (
                          <option key={city} value={city} />
                        ))}
                      </datalist>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefone</FormLabel>
                      <FormControl>
                        <Input placeholder="(00) 00000-0000" data-testid="input-edit-ally-phone" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="email@exemplo.com" data-testid="input-edit-ally-email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Observações</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Notas adicionais" data-testid="input-edit-ally-notes" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter className="px-6 py-4 border-t grid grid-cols-1 gap-2">
                <Button type="submit" disabled={updateMutation.isPending} data-testid="button-update-alliance" className="rounded-full w-full">
                  {updateMutation.isPending ? "Atualizando..." : "Atualizar"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Password Confirmation Dialog */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={(open) => {
        setIsPasswordDialogOpen(open);
        if (!open) {
          setExportPassword("");
          setPendingProtectedAction(null);
        }
      }}>
        <DialogContent className="max-w-sm p-0" aria-describedby="password-dialog-description">
          <DialogHeader className="px-5 pt-5 pb-3 border-b">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Lock className="w-5 h-5 text-primary" />
              Confirmação de Segurança
            </DialogTitle>
            <p id="password-dialog-description" className="text-xs text-muted-foreground mt-1">
              Digite a senha do administrador da conta para autorizar esta ação
            </p>
          </DialogHeader>
          <div className="p-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Senha do Administrador</label>
              <Input
                type="password"
                placeholder="Digite a senha"
                value={exportPassword}
                onChange={(e) => setExportPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    validatePasswordAndExecute();
                  }
                }}
                data-testid="input-export-password"
              />
              <p className="text-xs text-muted-foreground">
                Somente o administrador ou usuários autorizados podem executar esta ação
              </p>
            </div>
          </div>
          <DialogFooter className="px-5 py-4 border-t gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsPasswordDialogOpen(false);
                setExportPassword("");
                setPendingProtectedAction(null);
              }}
              className="flex-1"
              data-testid="button-cancel-export"
            >
              Cancelar
            </Button>
            <Button
              onClick={validatePasswordAndExecute}
              disabled={isValidatingPassword || !exportPassword.trim()}
              className="flex-1"
              data-testid="button-confirm-export"
            >
              {isValidatingPassword ? "Validando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Email Modal with Blocks */}
      <Dialog open={isBulkEmailModalOpen} onOpenChange={setIsBulkEmailModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] p-0" aria-describedby="bulk-email-dialog-description">
          <DialogHeader className="px-5 pt-5 pb-3 border-b">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              Envio de Email em Massa
            </DialogTitle>
            <p id="bulk-email-dialog-description" className="text-xs text-muted-foreground mt-1">
              Selecione o limite de envios por bloco e clique em cada bloco para enviar.
            </p>
          </DialogHeader>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-center gap-2">
              <span className="text-sm font-medium whitespace-nowrap">Limite por bloco:</span>
              <div className="flex items-center rounded-full border border-border p-1 gap-1">
                <button
                  type="button"
                  onClick={() => handleAllianceBlockSizeChange("30")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    emailBlockSize === 30
                      ? "border-2 border-green-500 text-green-700 dark:text-green-400"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="button-alliance-block-size-30"
                >
                  30 - Seguro
                </button>
                <button
                  type="button"
                  onClick={() => handleAllianceBlockSizeChange("100")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    emailBlockSize === 100
                      ? "border-2 border-yellow-500 text-yellow-700 dark:text-yellow-400"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="button-alliance-block-size-100"
                >
                  100 - Risco Médio
                </button>
                <button
                  type="button"
                  onClick={() => handleAllianceBlockSizeChange("0")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    emailBlockSize === 0
                      ? "border-2 border-red-500 text-red-700 dark:text-red-400"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="button-alliance-block-size-unlimited"
                >
                  Sem limite - Risco Alto
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Progresso:</span>
                <span className="text-sm text-muted-foreground">
                  {sentEmailBlocks.size} de {emailBlocks.length} blocos enviados
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Progress 
                  value={emailBlocks.length > 0 ? (sentEmailBlocks.size / emailBlocks.length) * 100 : 0} 
                  className="w-24 h-2"
                />
                <span className="text-xs font-medium">
                  {emailBlocks.length > 0 ? Math.round((sentEmailBlocks.size / emailBlocks.length) * 100) : 0}%
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Total: {getFilteredAlliances().filter(a => a.email).length} emails
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={resetEmailBlocks}
                disabled={sentEmailBlocks.size === 0}
                data-testid="button-reset-alliance-email-blocks"
              >
                Resetar Progresso
              </Button>
            </div>

            <Separator />

            <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2">
              {emailBlocks.map((block, index) => {
                const isSent = sentEmailBlocks.has(index);
                const isSending = sendingBlock === index;
                
                return (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg border border-border transition-colors hover-elevate"
                    data-testid={`alliance-email-block-${index}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center border border-border text-muted-foreground">
                        {isSent ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          <span className="text-xs font-medium">{index + 1}</span>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          Bloco {index + 1} de {emailBlocks.length}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Emails {block.startIndex} - {block.endIndex} ({block.emails.length} aliados)
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isSent ? (
                        <Badge variant="outline">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Enviado
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => sendEmailBlock(index)}
                          disabled={isSending}
                          data-testid={`button-send-alliance-block-${index}`}
                        >
                          {isSending ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin mr-1" />
                              Enviando...
                            </>
                          ) : (
                            <>
                              <Send className="w-3 h-3 mr-1" />
                              Enviar
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
              
              {emailBlocks.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  <Mail className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Nenhum aliado com email cadastrado</p>
                </div>
              )}
            </div>

            {sentEmailBlocks.size === emailBlocks.length && emailBlocks.length > 0 && (
              <div className="border border-border rounded-lg p-4 text-center">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="font-medium">
                  Todos os blocos foram enviados!
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {getFilteredAlliances().filter(a => a.email).length} emails disparados com sucesso
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="px-5 py-4 border-t">
            <Button
              variant="outline"
              onClick={() => setIsBulkEmailModalOpen(false)}
              className="w-full"
              data-testid="button-close-alliance-bulk-email"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isInviteModalOpen} onOpenChange={(open) => !open && handleCloseInviteModal()}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle>Enviar Convite para Aliança</DialogTitle>
            {selectedParty && (
              <p className="text-sm text-muted-foreground">
                Partido: {selectedParty.acronym} - {selectedParty.name}
              </p>
            )}
          </DialogHeader>
          <div className="overflow-y-auto px-6 py-4 flex-1">
            {!inviteLink ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Crie um convite único para convidar novos aliados políticos. 
                  O link gerado pode ser enviado por email ou WhatsApp.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium">Nome do convidado <span className="text-destructive">*</span></label>
                    <Input
                      type="text"
                      placeholder="Nome completo"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      data-testid="input-invite-name"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">WhatsApp do convidado <span className="text-destructive">*</span></label>
                    <Input
                      type="tel"
                      placeholder="(11) 99999-9999"
                      value={invitePhone}
                      onChange={(e) => setInvitePhone(e.target.value)}
                      data-testid="input-invite-phone"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Email do convidado (opcional)</label>
                    <Input
                      type="email"
                      placeholder="email@exemplo.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      data-testid="input-invite-email"
                      className="mt-1"
                    />
                  </div>
                </div>
                <Button
                  onClick={handleCreateInvite}
                  disabled={createInviteMutation.isPending}
                  className="w-full rounded-full"
                  data-testid="button-create-invite"
                >
                  {createInviteMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Criando convite...
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4 mr-2" />
                      Criar Convite
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <label className="text-sm font-medium text-muted-foreground">Link do convite</label>
                  <p className="text-sm mt-1 break-all font-mono" data-testid="text-invite-link">
                    {inviteLink}
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <Button
                    variant="outline"
                    onClick={handleCopyInviteLink}
                    className="rounded-full"
                    data-testid="button-copy-invite-link"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copiar Link
                  </Button>
                  {inviteEmail && (
                    <Button
                      variant="outline"
                      onClick={handleSendInviteByEmail}
                      className="rounded-full"
                      data-testid="button-send-invite-email"
                    >
                      <Mail className="w-4 h-4 mr-2" />
                      Enviar por Email
                    </Button>
                  )}
                  {invitePhone && (
                    <Button
                      variant="outline"
                      onClick={handleSendInviteByWhatsApp}
                      className="rounded-full"
                      data-testid="button-send-invite-whatsapp"
                    >
                      <MessageCircle className="w-4 h-4 mr-2" />
                      Enviar por WhatsApp
                    </Button>
                  )}
                </div>
                <Separator />
                <Button
                  variant="default"
                  onClick={() => {
                    setInviteLink(null);
                    setInviteName("");
                    setInviteEmail("");
                    setInvitePhone("");
                  }}
                  className="w-full rounded-full"
                  data-testid="button-create-new-invite"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Criar Novo Convite
                </Button>
              </div>
            )}
          </div>
          <DialogFooter className="px-6 py-4 border-t">
            <Button
              variant="outline"
              onClick={handleCloseInviteModal}
              className="w-full rounded-full"
              data-testid="button-close-invite-modal"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Invite Management Modal */}
      <Dialog open={isInviteManagementOpen} onOpenChange={setIsInviteManagementOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle>Gerenciar Convites - {selectedParty?.acronym}</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto px-6 py-4 flex-1">
            {selectedParty && allianceInvites?.filter(i => i.partyId === selectedParty.id).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum convite enviado para este partido.
              </div>
            ) : (
              <div className="space-y-3">
                {selectedParty && allianceInvites?.filter(i => i.partyId === selectedParty.id).map((invite) => (
                  <div
                    key={invite.id}
                    className="p-4 border rounded-lg flex items-center justify-between gap-4"
                    data-testid={`invite-item-${invite.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold truncate">{invite.inviteeName}</h4>
                      {invite.inviteePhone && (
                        <p className="text-sm text-muted-foreground truncate">{invite.inviteePhone}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        className={`rounded-full text-xs ${
                          invite.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                            : invite.status === 'accepted'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                            : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                        }`}
                      >
                        {invite.status === 'pending' ? 'Pendente' : invite.status === 'accepted' ? 'Aceito' : 'Rejeitado'}
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          const link = `https://www.politicall.com.br/convite-alianca/${invite.token}`;
                          navigator.clipboard.writeText(link).then(() => {
                            toast({ title: "Link copiado!" });
                          });
                        }}
                        data-testid={`button-copy-invite-link-${invite.id}`}
                        title="Copiar link do convite"
                        className="rounded-full"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("Tem certeza que deseja excluir este convite?")) {
                            deleteInviteMutation.mutate(invite.id);
                          }
                        }}
                        disabled={deleteInviteMutation.isPending}
                        data-testid={`button-delete-invite-${invite.id}`}
                        className="rounded-full text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="px-6 py-4 border-t">
            <Button
              variant="outline"
              onClick={() => setIsInviteManagementOpen(false)}
              className="w-full rounded-full"
              data-testid="button-close-invite-management"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
