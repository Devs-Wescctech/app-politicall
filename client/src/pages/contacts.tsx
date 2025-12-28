import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type Contact, type InsertContact, insertContactSchema, CONTACT_INTERESTS, CONTACT_SOURCES, GENDER_OPTIONS } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  Plus, Search, Pencil, Trash2, Mail, MessageCircle, Send, Copy, X,
  Church, Cross, Sparkles, Flame, Globe2, CircleDot, Volleyball, 
  Circle, Waves, Swords, Zap, Bike, Dumbbell, 
  Wind, Mountain, UtensilsCrossed, Leaf, Wine, Beer, Coffee,
  Music, HeartPulse, Disc3, Guitar, Radio, PartyPopper, Film,
  Drama, BookOpen, Palette, Camera, Music2, Paintbrush, Flower2,
  Dog, Trees, Sprout, Recycle, GraduationCap, Cpu, Gamepad2,
  Lightbulb, HandHeart, Users, Scale, Heart, Rainbow, Users2,
  Baby, BrainCircuit, Activity, Apple, Shirt, Sparkle, Plane,
  Map, Tent, Fish, Target, Tractor, Beef, Factory, Store,
  Building2, Wrench, Bus, Shield, Siren, Landmark, Vote,
  Flag, Home, Droplet, Construction, Hospital, Building,
  School, University, Baby as BabyIcon, Smile, Drum, Cake,
  Calendar as CalendarIcon, Star, Mic2, ShoppingCart, Download, FileText, Sheet, MoreVertical, QrCode, Share2, UserCircle2, TrendingUp, MapPin, Info, Lock, Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Filter, ChevronDown, ExternalLink
} from "lucide-react";
import { SiWhatsapp, SiFacebook, SiX } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import pdfMake from "pdfmake/build/pdfmake";
import * as pdfFonts from "pdfmake/build/vfs_fonts";
import * as XLSX from 'xlsx';
import logoUrl from "@assets/logo pol_1763308638963_1763559095972.png";
import politicallIconUrl from "@assets/icon politicall_1763309153389.png";
import { QRCodeSVG } from 'qrcode.react';

(pdfMake as any).vfs = pdfFonts;

const BRAZILIAN_STATES = [
  "Acre", "Alagoas", "Amapá", "Amazonas", "Bahia", "Ceará", "Distrito Federal",
  "Espírito Santo", "Goiás", "Maranhão", "Mato Grosso", "Mato Grosso do Sul",
  "Minas Gerais", "Pará", "Paraíba", "Paraná", "Pernambuco", "Piauí",
  "Rio de Janeiro", "Rio Grande do Norte", "Rio Grande do Sul", "Rondônia",
  "Roraima", "Santa Catarina", "São Paulo", "Sergipe", "Tocantins"
];

// Paleta de cores únicas para cada interesse
const INTEREST_COLORS = [
  "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-red-200",
  "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-200",
  "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-200",
  "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 border-yellow-200",
  "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 border-purple-200",
  "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200 border-pink-200",
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 border-indigo-200",
  "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 border-orange-200",
  "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200 border-teal-200",
  "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200 border-cyan-200",
  "bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200 border-lime-200",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 border-emerald-200",
  "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200 border-rose-200",
  "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900 dark:text-fuchsia-200 border-fuchsia-200",
  "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200 border-violet-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-amber-200",
  "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200 border-sky-200",
];

// Paleta de cores para badges sem fundo (apenas borda)
const INTEREST_COLORS_OUTLINE = [
  "border-red-500 text-red-700 dark:text-red-400",
  "border-blue-500 text-blue-700 dark:text-blue-400",
  "border-green-500 text-green-700 dark:text-green-400",
  "border-yellow-500 text-yellow-700 dark:text-yellow-400",
  "border-purple-500 text-purple-700 dark:text-purple-400",
  "border-pink-500 text-pink-700 dark:text-pink-400",
  "border-indigo-500 text-indigo-700 dark:text-indigo-400",
  "border-orange-500 text-orange-700 dark:text-orange-400",
  "border-teal-500 text-teal-700 dark:text-teal-400",
  "border-cyan-500 text-cyan-700 dark:text-cyan-400",
  "border-lime-500 text-lime-700 dark:text-lime-400",
  "border-emerald-500 text-emerald-700 dark:text-emerald-400",
  "border-rose-500 text-rose-700 dark:text-rose-400",
  "border-fuchsia-500 text-fuchsia-700 dark:text-fuchsia-400",
  "border-violet-500 text-violet-700 dark:text-violet-400",
  "border-amber-500 text-amber-700 dark:text-amber-400",
  "border-sky-500 text-sky-700 dark:text-sky-400",
];

// Função para gerar cor consistente baseada no nome do interesse
const getInterestColor = (interest: string, outline = false): string => {
  let hash = 0;
  for (let i = 0; i < interest.length; i++) {
    hash = interest.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = outline ? INTEREST_COLORS_OUTLINE : INTEREST_COLORS;
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

// Função para formatar nome com primeira letra maiúscula em cada palavra
const formatName = (name: string): string => {
  return name
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// Mapeamento de interesses para ícones correspondentes EXATOS
const INTEREST_ICONS: Record<string, any> = {
  // RELIGIÕES
  "Religião Católica": Church,           // Igreja católica
  "Religião Evangélica": Cross,          // Cruz cristã
  "Religião Espírita": Sparkles,         // Espiritualidade/luz
  "Religião Umbanda/Candomblé": Flame,   // Vela/energia espiritual
  "Outras Religiões": Star,              // Estrela espiritual
  
  // ESPORTES
  "Futebol": CircleDot,                  // Bola de futebol (círculo com ponto)
  "Vôlei": Volleyball,                   // Bola de vôlei
  "Basquete": Circle,                    // Bola de basquete
  "Natação": Waves,                      // Ondas/água
  "Artes Marciais": Swords,              // Espadas/luta
  "Corrida/Atletismo": Zap,              // Raio/velocidade
  "Ciclismo": Bike,                      // Bicicleta
  "Crossfit/Academia": Dumbbell,         // Halteres/musculação
  "Yoga/Pilates": Wind,                  // Respiração/equilíbrio
  "Esportes Radicais": Mountain,         // Montanha/aventura
  
  // GASTRONOMIA
  "Gastronomia": UtensilsCrossed,        // Talheres
  "Culinária Vegana/Vegetariana": Leaf,  // Folha verde
  "Vinhos": Wine,                        // Taça de vinho
  "Cervejas Artesanais": Beer,           // Caneca de cerveja
  "Café Especial": Coffee,               // Xícara de café
  
  // MÚSICA
  "Música Sertaneja": Guitar,            // Violão sertanejo
  "Música Gospel": HeartPulse,           // Coração/fé
  "MPB": Mic2,                           // Microfone/performance
  "Rock": Guitar,                        // Guitarra elétrica
  "Música Clássica": Radio,              // Orquestra/clássico
  "Pagode/Samba": Drum,                  // Tambor/percussão
  "Funk": Radio,                         // Som/batida
  "Música Eletrônica": Radio,            // DJ/eletrônica
  "Jazz": Music,                         // Música jazz
  
  // ARTES E CULTURA
  "Cinema": Film,                        // Película/filme
  "Teatro": Drama,                       // Máscaras teatro
  "Literatura": BookOpen,                // Livro aberto
  "Artes Plásticas": Palette,            // Paleta de pintura
  "Fotografia": Camera,                  // Câmera fotográfica
  "Dança": Music2,                       // Música/dança
  "Artesanato": Paintbrush,              // Pincel artesanato
  "Jardinagem": Flower2,                 // Flor/planta
  
  // PETS E NATUREZA
  "Pets/Animais de Estimação": Dog,      // Cachorro/pet
  "Meio Ambiente": Trees,                // Árvores/floresta
  "Sustentabilidade": Sprout,            // Broto/crescimento
  "Reciclagem": Recycle,                 // Símbolo reciclagem
  
  // EDUCAÇÃO E TECNOLOGIA
  "Educação": GraduationCap,             // Capelo formatura
  "Tecnologia": Cpu,                     // Processador/tech
  "Games/E-sports": Gamepad2,            // Controle videogame
  "Empreendedorismo": Lightbulb,         // Lâmpada/ideia
  
  // CAUSAS SOCIAIS
  "Voluntariado": HandHeart,             // Mão coração/ajuda
  "Causas Sociais": Users,               // Pessoas/comunidade
  "Direitos Humanos": Scale,             // Balança/justiça
  "Feminismo": Heart,                    // Coração/igualdade
  "LGBTQIA+": Rainbow,                   // Arco-íris/orgulho
  "Movimento Negro": Flag,               // Bandeira/movimento
  "Terceira Idade": Users2,              // Idosos/grupo
  "Juventude": Users,                    // Jovens/grupo
  "Infância": Baby,                      // Bebê/criança
  
  // SAÚDE
  "Saúde Mental": BrainCircuit,          // Cérebro/mente
  "Saúde e Bem-Estar": Activity,         // Atividade/saúde
  "Nutrição": Apple,                     // Maçã/alimentação
  
  // MODA E BELEZA
  "Moda": Shirt,                         // Roupa/camisa
  "Beleza": Sparkle,                     // Brilho/beleza
  
  // VIAGENS E LAZER
  "Turismo": Plane,                      // Avião/viagem
  "Viagens": Map,                        // Mapa/exploração
  "Camping/Trilhas": Tent,               // Barraca/camping
  "Pesca": Fish,                         // Peixe/pescaria
  "Caça": Target,                        // Alvo/caça
  
  // AGRICULTURA E PECUÁRIA
  "Agricultura Familiar": Tractor,       // Trator/fazenda
  "Pecuária": Beef,                      // Gado/carne
  "Agronegócio": Tractor,                // Trator/agricultura
  
  // ECONOMIA E TRABALHO
  "Comércio Local": ShoppingCart,        // Carrinho/comércio
  "Indústria": Factory,                  // Fábrica/indústria
  "Serviços": Wrench,                    // Chave/serviço
  
  // INFRAESTRUTURA URBANA
  "Transporte Público": Bus,             // Ônibus/transporte
  "Mobilidade Urbana": Bike,             // Bicicleta/mobilidade
  "Segurança Pública": Shield,           // Escudo/proteção
  "Defesa Civil": Siren,                 // Sirene/emergência
  "Bombeiros": Flame,                    // Chama/fogo
  
  // POLÍTICA
  "Política Partidária": Landmark,       // Monumento/política
  "Movimentos Sociais": Vote,            // Voto/participação
  "Sindicatos": Flag,                    // Bandeira/união
  "Associações de Classe": Building2,    // Prédio/organização
  
  // SERVIÇOS PÚBLICOS
  "Moradia Popular": Home,               // Casa/moradia
  "Saneamento Básico": Droplet,          // Gota/água
  "Iluminação Pública": Lightbulb,       // Lâmpada/luz
  "Pavimentação": Construction,          // Construção/obra
  "Saúde Pública": Hospital,             // Hospital/saúde
  "Hospitais": Hospital,                 // Hospital
  "Postos de Saúde": Building,           // Posto/prédio
  "Escolas Públicas": School,            // Escola/educação
  "Universidades": University,           // Universidade/ensino
  "Creches": BabyIcon,                   // Bebê/creche
  
  // FESTAS E TRADIÇÕES
  "Cultura Popular": Smile,              // Sorriso/alegria
  "Festas Tradicionais": Drum,           // Tambor/festa
  "Carnaval": PartyPopper,               // Confete/carnaval
  "Festas Juninas": Flame,               // Fogueira junina
  "Rodeios": Beef,                       // Gado/rodeio
  "Feiras e Exposições": Store,          // Feira/mercado
};

export default function Contacts() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState<string>("");
  const [selectedState, setSelectedState] = useState<string>("");
  const [selectedInterest, setSelectedInterest] = useState<string>("");
  const [selectedSource, setSelectedSource] = useState<string>("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isQrCodeDialogOpen, setIsQrCodeDialogOpen] = useState(false);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [isProfileExportDialogOpen, setIsProfileExportDialogOpen] = useState(false);
  const [isProfilePhotoDialogOpen, setIsProfilePhotoDialogOpen] = useState(false);
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(null);
  const [selectedTopCount, setSelectedTopCount] = useState(1);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isStateFocused, setIsStateFocused] = useState(false);
  const [isCityFocused, setIsCityFocused] = useState(false);
  const [isInterestFocused, setIsInterestFocused] = useState(false);
  const [isSourceFocused, setIsSourceFocused] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  
  // Export password protection
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [exportPassword, setExportPassword] = useState("");
  const [isValidatingPassword, setIsValidatingPassword] = useState(false);
  const [pendingExportType, setPendingExportType] = useState<"pdf" | "excel" | "profile-pdf" | "profile-excel" | "copy-whatsapp" | "bulk-email" | null>(null);
  
  // Import contacts
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<{ success: number; errors: number } | null>(null);
  
  // Bulk selection
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [bulkDeletePassword, setBulkDeletePassword] = useState("");
  
  // Bulk email with blocks
  const [isBulkEmailModalOpen, setIsBulkEmailModalOpen] = useState(false);
  const [sentEmailBlocks, setSentEmailBlocks] = useState<Set<number>>(() => {
    const saved = localStorage.getItem('sentEmailBlocks');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [sendingBlock, setSendingBlock] = useState<number | null>(null);
  const [bulkEmailSessionId, setBulkEmailSessionId] = useState<string>(() => {
    return localStorage.getItem('bulkEmailSessionId') || '';
  });
  const [emailBlockSize, setEmailBlockSize] = useState<number>(() => {
    const saved = localStorage.getItem('emailBlockSize');
    return saved ? parseInt(saved) : 30;
  });
  
  const { toast } = useToast();

  const { data: contacts, isLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  // Buscar dados do usuário atual (já está em cache, carregamento instantâneo)
  const { data: currentUser } = useQuery<any>({
    queryKey: ["/api/auth/me"],
  });

  // Buscar dados do admin da conta (usado para relatórios e exportações)
  const { data: adminData } = useQuery<any>({
    queryKey: ["/api/account/admin"],
  });

  // Usar slug do usuário se for admin, caso contrário usar do adminData
  // Para voluntários, adicionar o código único do voluntário à URL
  const baseSlug = currentUser?.role === 'admin' ? currentUser?.slug : adminData?.slug;
  const qrCodeSlug = currentUser?.role === 'voluntario' && currentUser?.volunteerCode 
    ? `${baseSlug}/${currentUser.volunteerCode}` 
    : baseSlug;
  // O nome e avatar do QR Code sempre usa do admin/candidato (landing page é do candidato)
  const qrCodeName = currentUser?.role === 'admin' ? currentUser?.name : adminData?.name;
  const qrCodeAvatar = currentUser?.role === 'admin' ? currentUser?.avatar : adminData?.avatar;

  // Buscar perfil agregado dos eleitores
  const { data: voterProfile } = useQuery<any>({
    queryKey: ["/api/contacts/profile"],
    enabled: isProfileDialogOpen, // Só busca quando o modal está aberto
  });

  const form = useForm<InsertContact>({
    resolver: zodResolver(insertContactSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      age: undefined,
      gender: undefined,
      state: "",
      city: "",
      interests: [],
      source: "",
      notes: "",
    },
  });

  // Extract unique cities from contacts
  const cities = useMemo(() => {
    if (!contacts) return [];
    const uniqueCities = Array.from(new Set(contacts.map(c => c.city).filter((city): city is string => Boolean(city))));
    return uniqueCities.sort();
  }, [contacts]);

  // Extract unique states from contacts
  const states = useMemo(() => {
    if (!contacts) return [];
    const uniqueStates = Array.from(new Set(contacts.map(c => c.state).filter((state): state is string => Boolean(state))));
    return uniqueStates.sort();
  }, [contacts]);

  // Extract unique sources from contacts
  const sources = useMemo(() => {
    if (!contacts) return [];
    const uniqueSources = Array.from(new Set(contacts.map(c => c.source).filter((source): source is string => Boolean(source))));
    return uniqueSources.sort();
  }, [contacts]);

  const getUniqueCities = () => {
    if (!contacts) return [];
    const cities = contacts
      .map((c) => c.city)
      .filter((city): city is string => Boolean(city));
    return Array.from(new Set(cities)).sort();
  };

  const capitalizeWords = (str: string) => {
    return str
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const createMutation = useMutation({
    mutationFn: (data: InsertContact) => apiRequest("POST", "/api/contacts", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Contato criado com sucesso!" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Erro ao criar contato", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: InsertContact }) =>
      apiRequest("PATCH", `/api/contacts/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Contato atualizado com sucesso!" });
      setIsDialogOpen(false);
      setEditingContact(null);
      form.reset();
    },
    onError: () => {
      toast({ title: "Erro ao atualizar contato", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/contacts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Contato excluído com sucesso!" });
    },
    onError: () => {
      toast({ title: "Erro ao excluir contato", variant: "destructive" });
    },
  });

  const profilePhotoMutation = useMutation({
    mutationFn: (avatar: string | null) => apiRequest("PATCH", "/api/auth/profile", { avatar }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Foto de perfil atualizada com sucesso!" });
      setIsProfilePhotoDialogOpen(false);
      setProfilePhotoFile(null);
      setProfilePhotoPreview(null);
    },
    onError: () => {
      toast({ title: "Erro ao atualizar foto de perfil", variant: "destructive" });
    },
  });

  const resizeImage = (file: File, maxSize: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const reader = new FileReader();

      reader.onload = (e) => {
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxSize) {
              height *= maxSize / width;
              width = maxSize;
            }
          } else {
            if (height > maxSize) {
              width *= maxSize / height;
              height = maxSize;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleProfilePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: "Por favor, selecione uma imagem válida", variant: "destructive" });
      return;
    }

    setProfilePhotoFile(file);
    try {
      const resized = await resizeImage(file, 400);
      setProfilePhotoPreview(resized);
    } catch (error) {
      toast({ title: "Erro ao processar imagem", variant: "destructive" });
    }
  };

  const handleProfilePhotoSave = () => {
    if (profilePhotoPreview) {
      profilePhotoMutation.mutate(profilePhotoPreview);
    }
  };

  const handleSubmit = (data: InsertContact) => {
    if (editingContact) {
      updateMutation.mutate({ id: editingContact.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (contact: Contact) => {
    setEditingContact(contact);
    
    // Normalizar e validar gender (case-insensitive) para preservar valores legados
    const normalizeGender = (value: string | null | undefined) => {
      if (!value) return undefined;
      
      // Tentar encontrar uma correspondência case-insensitive
      const normalized = GENDER_OPTIONS.find(
        option => option.toLowerCase() === value.toLowerCase()
      );
      
      return normalized as "Masculino" | "Feminino" | "Não-binário" | "Outro" | "Prefiro não responder" | undefined;
    };
    
    form.reset({
      name: contact.name,
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      age: contact.age ?? undefined,
      gender: normalizeGender(contact.gender),
      state: contact.state ?? "",
      city: contact.city ?? "",
      interests: contact.interests ?? [],
      source: contact.source ?? "",
      notes: contact.notes ?? "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Tem certeza que deseja excluir este contato?")) {
      deleteMutation.mutate(id);
    }
  };

  // Bulk selection functions
  const toggleSelectContact = (id: string) => {
    setSelectedContacts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (!filteredContacts) return;
    
    if (selectedContacts.size === filteredContacts.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(filteredContacts.map(c => c.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedContacts.size === 0) return;
    
    setIsBulkDeleting(true);
    let successCount = 0;
    let errorCount = 0;
    
    const contactIds = Array.from(selectedContacts);
    for (const id of contactIds) {
      try {
        await apiRequest("DELETE", `/api/contacts/${id}`);
        successCount++;
      } catch (error) {
        errorCount++;
      }
    }
    
    setIsBulkDeleting(false);
    setSelectedContacts(new Set());
    setIsBulkDeleteDialogOpen(false);
    setBulkDeletePassword("");
    queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
    
    if (successCount > 0) {
      toast({ 
        title: `${successCount} contato(s) excluído(s)`,
        description: errorCount > 0 ? `${errorCount} erro(s) ocorreram` : undefined,
      });
    } else {
      toast({ title: "Erro ao excluir contatos", variant: "destructive" });
    }
  };

  const validateBulkDeletePassword = async () => {
    if (!bulkDeletePassword.trim()) return;
    
    setIsBulkDeleting(true);
    try {
      const response = await apiRequest("POST", "/api/auth/validate-password", {
        password: bulkDeletePassword
      });
      
      if (response.ok) {
        await handleBulkDelete();
      } else {
        toast({ title: "Senha incorreta", variant: "destructive" });
        setIsBulkDeleting(false);
      }
    } catch (error) {
      toast({ title: "Erro ao validar senha", variant: "destructive" });
      setIsBulkDeleting(false);
    }
  };

  // Filter contacts based on search query, city, state, interests, and source
  const filteredContacts = useMemo(() => {
    if (!contacts) return [];
    
    return contacts.filter((contact) => {
      const matchesSearch = !searchQuery || 
        contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contact.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contact.phone?.includes(searchQuery);
      
      const matchesCity = !selectedCity || contact.city === selectedCity;
      const matchesState = !selectedState || contact.state === selectedState;
      const matchesInterest = !selectedInterest || contact.interests?.includes(selectedInterest);
      const matchesSource = !selectedSource || contact.source === selectedSource;
      
      return matchesSearch && matchesCity && matchesState && matchesInterest && matchesSource;
    });
  }, [contacts, searchQuery, selectedCity, selectedState, selectedInterest, selectedSource]);

  // Email blocks calculation - divide contacts with email into chunks based on selected block size
  const emailBlocks = useMemo(() => {
    const contactsWithEmail = contacts?.filter(c => c.email) || [];
    const blocks: { emails: string[]; startIndex: number; endIndex: number }[] = [];
    
    // Se blockSize é 0, significa "sem limites" - todos em um único bloco
    if (emailBlockSize === 0) {
      if (contactsWithEmail.length > 0) {
        blocks.push({
          emails: contactsWithEmail.map(c => c.email!),
          startIndex: 1,
          endIndex: contactsWithEmail.length
        });
      }
      return blocks;
    }
    
    for (let i = 0; i < contactsWithEmail.length; i += emailBlockSize) {
      const chunk = contactsWithEmail.slice(i, i + emailBlockSize);
      blocks.push({
        emails: chunk.map(c => c.email!),
        startIndex: i + 1,
        endIndex: Math.min(i + emailBlockSize, contactsWithEmail.length)
      });
    }
    return blocks;
  }, [contacts, emailBlockSize]);

  // Handle block size change - reset sent blocks
  const handleBlockSizeChange = (value: string) => {
    const newSize = parseInt(value);
    setEmailBlockSize(newSize);
    localStorage.setItem('emailBlockSize', value);
    setSentEmailBlocks(new Set());
    localStorage.setItem('sentEmailBlocks', JSON.stringify([]));
  };

  // Generate a unique session ID based on contacts for tracking
  const currentEmailSessionId = useMemo(() => {
    if (!contacts) return '';
    const emailList = contacts.filter(c => c.email).map(c => c.email).sort().join(',');
    let hash = 0;
    for (let i = 0; i < emailList.length; i++) {
      const char = emailList.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `session_${Math.abs(hash)}`;
  }, [contacts]);

  // Reset sent blocks if session changed (different contact list)
  const checkAndResetSession = () => {
    if (bulkEmailSessionId !== currentEmailSessionId) {
      setSentEmailBlocks(new Set());
      setBulkEmailSessionId(currentEmailSessionId);
      localStorage.setItem('bulkEmailSessionId', currentEmailSessionId);
      localStorage.setItem('sentEmailBlocks', JSON.stringify([]));
    }
  };

  const executeBulkEmail = () => {
    const contactsWithEmail = contacts?.filter(c => c.email) || [];
    if (contactsWithEmail.length === 0) {
      toast({ title: "Nenhum contato com email", variant: "destructive" });
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
        localStorage.setItem('sentEmailBlocks', JSON.stringify(Array.from(newSentBlocks)));
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
    localStorage.setItem('sentEmailBlocks', JSON.stringify([]));
    toast({ title: "Progresso resetado", description: "Todos os blocos foram marcados como pendentes" });
  };

  const executeCopyWhatsAppNumbers = () => {
    const phones = contacts
      ?.filter(c => c.phone)
      .map(c => {
        const cleanPhone = c.phone!.replace(/\D/g, '');
        const internationalPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
        return `+${internationalPhone}`;
      })
      .join('\n');
    
    if (!phones) {
      toast({ title: "Nenhum contato com telefone", variant: "destructive" });
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

  const handleCopyWhatsAppNumbers = () => {
    requestProtectedAction("copy-whatsapp");
  };

  const handleBulkEmail = () => {
    requestProtectedAction("bulk-email");
  };

  // Password validation for exports and protected actions
  const requestProtectedAction = (type: "pdf" | "excel" | "profile-pdf" | "profile-excel" | "copy-whatsapp" | "bulk-email") => {
    setPendingExportType(type);
    setExportPassword("");
    setIsPasswordDialogOpen(true);
  };

  // Import contacts functions
  const handleFileUpload = async (file: File) => {
    setImportFile(file);
    setImportErrors([]);
    setImportPreview([]);
    setImportResult(null);
    
    try {
      const fileExtension = file.name.split('.').pop()?.toLowerCase();
      let data: any[] = [];
      
      if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      } else if (fileExtension === 'csv') {
        const text = await file.text();
        const lines = text.split('\n').filter(line => line.trim());
        data = lines.map(line => {
          const values: string[] = [];
          let current = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if ((char === ',' || char === ';') && !inQuotes) {
              values.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          values.push(current.trim());
          return values;
        });
      } else if (fileExtension === 'pdf') {
        // Process PDF on server for better reliability
        try {
          const formData = new FormData();
          formData.append('file', file);
          
          // Get auth token from localStorage
          const token = localStorage.getItem('auth_token');
          const headers: HeadersInit = {};
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
          
          const response = await fetch('/api/contacts/parse-pdf', {
            method: 'POST',
            headers,
            body: formData,
            credentials: 'include',
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            setImportErrors([errorData.error || 'Erro ao processar o PDF']);
            return;
          }
          
          const result = await response.json();
          data = result.data;
          
          if (!data || data.length < 2) {
            setImportErrors(['O PDF não contém dados tabulares suficientes para importação']);
            return;
          }
        } catch (pdfError) {
          console.error('Erro ao processar PDF:', pdfError);
          setImportErrors(['Erro ao processar o PDF. Verifique se o arquivo não está corrompido ou protegido.']);
          return;
        }
      } else {
        setImportErrors(['Formato de arquivo não suportado. Use .xlsx, .xls, .csv ou .pdf']);
        return;
      }
      
      if (data.length < 1) {
        setImportErrors(['O arquivo está vazio ou não contém dados válidos']);
        return;
      }
      
      // Mapeamento flexível de colunas
      const columnMapping: Record<string, string[]> = {
        name: ['nome', 'name', 'nome completo', 'full name', 'contato', 'contact'],
        email: ['email', 'e-mail', 'correio', 'mail'],
        phone: ['telefone', 'phone', 'celular', 'mobile', 'whatsapp', 'tel', 'fone'],
        age: ['idade', 'age', 'anos'],
        gender: ['genero', 'gênero', 'gender', 'sexo', 'sex'],
        state: ['estado', 'state', 'uf'],
        city: ['cidade', 'city', 'municipio', 'município'],
        interests: ['interesses', 'interests', 'interesse', 'interest'],
        source: ['fonte', 'source', 'origem', 'origin'],
        notes: ['notas', 'notes', 'observações', 'observacoes', 'obs', 'observations'],
      };
      
      // Helper functions to detect data types
      const looksLikeEmail = (val: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
      const looksLikePhone = (val: string): boolean => /^[\d\s\(\)\-\+\.]{8,}$/.test(val.replace(/\D/g, '').length >= 8 ? val : '');
      const looksLikeName = (val: string): boolean => {
        if (!val || val.length < 2) return false;
        if (looksLikeEmail(val) || looksLikePhone(val)) return false;
        // Names typically have letters and maybe spaces/hyphens
        return /^[a-zA-ZÀ-ÿ\s\-'\.]+$/.test(val) && val.length >= 2;
      };
      const looksLikeHeader = (val: string): boolean => {
        const headerKeywords = ['nome', 'name', 'email', 'telefone', 'phone', 'cidade', 'city', 'estado', 'state', 'idade', 'age', 'genero', 'gender', 'notas', 'notes', 'fonte', 'source', 'interesses'];
        return headerKeywords.some(k => val.toLowerCase().includes(k));
      };
      
      // Check if first row looks like a header
      const firstRow = (data[0] as string[]).map(h => String(h || '').trim());
      const hasHeaderRow = firstRow.some(cell => looksLikeHeader(cell));
      
      let headers: string[];
      let rows: any[];
      
      if (hasHeaderRow) {
        headers = firstRow.map(h => h.toLowerCase());
        rows = data.slice(1);
      } else {
        // PDF without headers - auto-detect column types
        // Assume first column with text that looks like a name is the name column
        headers = [];
        rows = data;
        
        // Analyze all rows to detect column types
        const columnCount = Math.max(...data.map((row: any) => Array.isArray(row) ? row.length : 0));
        const columnTypes: string[] = new Array(columnCount).fill('unknown');
        
        // Sample first few rows to detect types
        const sampleRows = data.slice(0, Math.min(5, data.length));
        for (let col = 0; col < columnCount; col++) {
          let nameCount = 0, emailCount = 0, phoneCount = 0;
          for (const row of sampleRows) {
            const val = String((row as any[])[col] || '').trim();
            if (looksLikeEmail(val)) emailCount++;
            else if (looksLikePhone(val)) phoneCount++;
            else if (looksLikeName(val)) nameCount++;
          }
          
          if (emailCount > sampleRows.length / 2) columnTypes[col] = 'email';
          else if (phoneCount > sampleRows.length / 2) columnTypes[col] = 'phone';
          else if (nameCount > sampleRows.length / 2) columnTypes[col] = 'name';
        }
        
        // If no name column detected, assume first text column is name
        if (!columnTypes.includes('name')) {
          for (let col = 0; col < columnCount; col++) {
            if (columnTypes[col] === 'unknown') {
              columnTypes[col] = 'name';
              break;
            }
          }
        }
        
        // Create synthetic headers based on detected types
        headers = columnTypes.map((type, idx) => {
          switch (type) {
            case 'name': return 'nome';
            case 'email': return 'email';
            case 'phone': return 'telefone';
            default: return `coluna${idx}`;
          }
        });
      }
      
      if (rows.length < 1) {
        setImportErrors(['O arquivo não contém dados para importar']);
        return;
      }
      
      const findColumnIndex = (fieldAliases: string[]): number => {
        for (const alias of fieldAliases) {
          const idx = headers.findIndex(h => h.includes(alias));
          if (idx !== -1) return idx;
        }
        return -1;
      };
      
      const columnIndices: Record<string, number> = {};
      for (const [field, aliases] of Object.entries(columnMapping)) {
        columnIndices[field] = findColumnIndex(aliases);
      }
      
      if (columnIndices.name === -1) {
        setImportErrors(['Não foi possível identificar uma coluna de nomes. Verifique se o arquivo contém nomes de contatos.']);
        return;
      }
      
      const parsedContacts: any[] = [];
      const errors: string[] = [];
      
      rows.forEach((row: any, index: number) => {
        const rowArray = Array.isArray(row) ? row : Object.values(row);
        const getValue = (colIndex: number): string => {
          if (colIndex === -1) return '';
          const val = rowArray[colIndex];
          return val !== undefined && val !== null ? String(val).trim() : '';
        };
        
        const name = getValue(columnIndices.name);
        if (!name) {
          errors.push(`Linha ${index + 2}: Nome vazio, ignorado`);
          return;
        }
        
        const contact: any = {
          name: formatName(name),
          email: getValue(columnIndices.email) || null,
          phone: getValue(columnIndices.phone) || null,
          state: getValue(columnIndices.state) || null,
          city: getValue(columnIndices.city) ? capitalizeWords(getValue(columnIndices.city)) : null,
          notes: getValue(columnIndices.notes) || null,
          source: getValue(columnIndices.source) || 'Importação',
        };
        
        // Parse age
        const ageStr = getValue(columnIndices.age);
        if (ageStr) {
          const age = parseInt(ageStr, 10);
          if (!isNaN(age) && age > 0 && age < 150) {
            contact.age = age;
          }
        }
        
        // Parse gender
        const genderStr = getValue(columnIndices.gender).toLowerCase();
        if (genderStr) {
          if (genderStr.includes('masc') || genderStr === 'm' || genderStr === 'male') {
            contact.gender = 'Masculino';
          } else if (genderStr.includes('fem') || genderStr === 'f' || genderStr === 'female') {
            contact.gender = 'Feminino';
          } else if (genderStr.includes('não') || genderStr.includes('nao') || genderStr.includes('nb') || genderStr.includes('non')) {
            contact.gender = 'Não-binário';
          } else if (genderStr.includes('outro') || genderStr.includes('other')) {
            contact.gender = 'Outro';
          } else if (genderStr.includes('prefer')) {
            contact.gender = 'Prefiro não responder';
          }
        }
        
        // Parse interests
        const interestsStr = getValue(columnIndices.interests);
        if (interestsStr) {
          const interestsList = interestsStr.split(/[,;|]/).map(i => i.trim()).filter(i => i);
          const validInterests = interestsList.filter(i => 
            CONTACT_INTERESTS.some(ci => ci.toLowerCase() === i.toLowerCase())
          );
          if (validInterests.length > 0) {
            contact.interests = validInterests.map(i => 
              CONTACT_INTERESTS.find(ci => ci.toLowerCase() === i.toLowerCase()) || i
            );
          }
        }
        
        parsedContacts.push(contact);
      });
      
      setImportPreview(parsedContacts);
      setImportErrors(errors);
      
      if (parsedContacts.length === 0) {
        setImportErrors(['Nenhum contato válido encontrado no arquivo']);
      }
    } catch (error) {
      console.error('Erro ao processar arquivo:', error);
      setImportErrors(['Erro ao processar o arquivo. Verifique se o formato está correto.']);
    }
  };

  const executeImport = async () => {
    if (importPreview.length === 0) return;
    
    setIsImporting(true);
    setImportProgress(0);
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < importPreview.length; i++) {
      try {
        await apiRequest("POST", "/api/contacts", importPreview[i]);
        successCount++;
      } catch (error) {
        errorCount++;
      }
      setImportProgress(Math.round(((i + 1) / importPreview.length) * 100));
    }
    
    setIsImporting(false);
    setImportResult({ success: successCount, errors: errorCount });
    queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
    
    if (successCount > 0) {
      toast({ 
        title: "Importação concluída!", 
        description: `${successCount} contato(s) importado(s) com sucesso${errorCount > 0 ? `, ${errorCount} erro(s)` : ''}`
      });
    } else {
      toast({ title: "Erro na importação", variant: "destructive" });
    }
  };

  const resetImport = () => {
    setImportFile(null);
    setImportPreview([]);
    setImportErrors([]);
    setImportResult(null);
    setImportProgress(0);
  };

  const validatePasswordAndExport = async () => {
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
        
        // Execute the pending action
        switch (pendingExportType) {
          case "pdf":
            await executeExportPDF();
            break;
          case "excel":
            await executeExportExcel();
            break;
          case "profile-pdf":
            await executeExportProfilePDF();
            break;
          case "profile-excel":
            await executeExportProfileExcel();
            break;
          case "copy-whatsapp":
            executeCopyWhatsAppNumbers();
            break;
          case "bulk-email":
            executeBulkEmail();
            break;
        }
        setPendingExportType(null);
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

  const executeExportPDF = async () => {
    if (!filteredContacts || filteredContacts.length === 0) {
      toast({ title: "Nenhum contato para exportar", variant: "destructive" });
      return;
    }

    // Converter logo para base64
    const getBase64Image = async (url: string): Promise<string> => {
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (error) {
        console.error('Erro ao carregar logo:', error);
        return '';
      }
    };

    const logoBase64 = await getBase64Image(logoUrl);

    // Informações do admin
    const adminName = adminData?.name || 'Administrador';
    const adminParty = adminData?.party ? `${adminData.party.acronym} - ${adminData.party.name}` : 'Sem partido';
    const adminPhone = adminData?.phone || 'Não informado';
    const adminEmail = adminData?.email || 'Não informado';

    const docDefinition: any = {
      pageSize: 'A4',
      pageMargins: [40, 120, 40, 60],
      header: {
        margin: [40, 20, 40, 0],
        columns: [
          {
            image: logoBase64,
            width: 120,
            alignment: 'center',
            margin: [0, 0, 0, 10]
          }
        ]
      },
      footer: function(currentPage: number, pageCount: number) {
        return {
          margin: [40, 20, 40, 20],
          text: 'Gerado por Politicall - Sistema de Gestão Política',
          alignment: 'center',
          fontSize: 8,
          color: '#6b7280'
        };
      },
      content: [
        {
          columns: [
            {
              width: '*',
              stack: [
                { text: adminName, style: 'adminName' },
                { text: adminParty, style: 'adminInfo' },
                { text: `Telefone: ${adminPhone}`, style: 'adminInfo' },
                { text: `Email: ${adminEmail}`, style: 'adminInfo' }
              ]
            }
          ],
          margin: [0, 0, 0, 20]
        },
        {
          text: 'Relatório de Eleitores',
          style: 'header',
          alignment: 'center',
          margin: [0, 0, 0, 5]
        },
        {
          text: `Total de eleitores: ${filteredContacts.length}`,
          style: 'subheader',
          alignment: 'center',
          margin: [0, 0, 0, 20]
        },
        {
          table: {
            headerRows: 1,
            widths: ['*', 'auto', 'auto', 'auto', 'auto', '*'],
            body: [
              [
                { text: 'Nome', style: 'tableHeader' },
                { text: 'Email', style: 'tableHeader' },
                { text: 'Telefone', style: 'tableHeader' },
                { text: 'Cidade/Estado', style: 'tableHeader' },
                { text: 'Interesses', style: 'tableHeader' },
                { text: 'Observações', style: 'tableHeader' }
              ],
              ...filteredContacts.map(contact => [
                formatName(contact.name),
                contact.email || '-',
                contact.phone || '-',
                `${contact.city || '-'}/${contact.state || '-'}`,
                contact.interests && contact.interests.length > 0 
                  ? contact.interests.join(', ') 
                  : '-',
                contact.notes || '-'
              ])
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

    pdfMake.createPdf(docDefinition).download(`eleitores-${new Date().toISOString().split('T')[0]}.pdf`);
    toast({ title: `PDF gerado com ${filteredContacts.length} eleitores!` });
    setIsExportDialogOpen(false);
  };

  const executeExportExcel = async () => {
    if (!filteredContacts || filteredContacts.length === 0) {
      toast({ title: "Nenhum contato para exportar", variant: "destructive" });
      return;
    }

    // Informações do admin
    const adminName = adminData?.name || 'Administrador';
    const adminParty = adminData?.party ? `${adminData.party.acronym} - ${adminData.party.name}` : 'Sem partido';
    const adminPhone = adminData?.phone || 'Não informado';
    const adminEmail = adminData?.email || 'Não informado';

    // Criar dados da planilha
    const worksheetData = [
      ['RELATÓRIO DE ELEITORES'],
      [],
      ['Responsável:', adminName],
      ['Partido:', adminParty],
      ['Telefone:', adminPhone],
      ['Email:', adminEmail],
      [],
      [`Total de eleitores: ${filteredContacts.length}`],
      [],
      ['Nome', 'Email', 'Telefone', 'Cidade/Estado', 'Interesses', 'Observações'],
      ...filteredContacts.map(contact => [
        formatName(contact.name),
        contact.email || '-',
        contact.phone || '-',
        `${contact.city || '-'}/${contact.state || '-'}`,
        contact.interests && contact.interests.length > 0 ? contact.interests.join(', ') : '-',
        contact.notes || '-'
      ])
    ];

    // Criar workbook e worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(worksheetData);

    // Definir larguras das colunas
    ws['!cols'] = [
      { wch: 30 }, // Nome
      { wch: 30 }, // Email
      { wch: 18 }, // Telefone
      { wch: 20 }, // Cidade/Estado
      { wch: 40 }, // Interesses
      { wch: 40 }  // Observações
    ];

    // Mesclar células para o título
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }, // Título principal
    ];

    // Adicionar worksheet ao workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Eleitores');

    // Baixar arquivo
    XLSX.writeFile(wb, `eleitores-${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: `Excel gerado com ${filteredContacts.length} eleitores!` });
    setIsExportDialogOpen(false);
  };

  const executeExportProfilePDF = async () => {
    if (!voterProfile || voterProfile.totalContacts === 0) {
      toast({ title: "Nenhum dado de perfil para exportar", variant: "destructive" });
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

    const docDefinition: any = {
      pageSize: 'A4',
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
              { text: adminData?.name || 'Gabinete', style: 'header' },
              { text: 'Perfil dos Eleitores', style: 'subheader' }
            ],
            alignment: 'right'
          }
        ]
      },
      content: [
        { text: 'Estatísticas Principais', style: 'sectionTitle' },
        {
          columns: [
            { text: `Total de eleitores: ${voterProfile.totalContacts}`, style: 'stat' },
            voterProfile.averageAge && voterProfile.totalContacts >= 3 
              ? { text: `Idade média: ${voterProfile.averageAge.toFixed(1)} anos`, style: 'stat' }
              : { text: '' }
          ]
        },
        { text: '', margin: [0, 10] },

        ...(voterProfile.topInterests && voterProfile.topInterests.length > 0 ? [
          { text: `Top ${selectedTopCount} Interesses`, style: 'sectionTitle' },
          {
            ul: voterProfile.topInterests.slice(0, selectedTopCount).map((item: any) => 
              `${item.interest}: ${item.count} ${item.count === 1 ? 'eleitor' : 'eleitores'}`
            ),
            style: 'list'
          },
          { text: '', margin: [0, 10] }
        ] : []),

        { text: 'Distribuição Geográfica', style: 'sectionTitle' },
        ...(voterProfile.topStates && voterProfile.topStates.length > 0 ? [
          { text: 'Estados (Top 5):', style: 'subsectionTitle' },
          {
            ul: voterProfile.topStates.map((item: any) => {
              const percentage = (item.count / voterProfile.totalContacts) * 100;
              return `${item.state}: ${percentage.toFixed(1)}% (${item.count})`;
            }),
            style: 'list'
          },
          { text: '', margin: [0, 5] }
        ] : []),
        ...(voterProfile.topCities && voterProfile.topCities.length > 0 ? [
          { text: 'Cidades (Top 5):', style: 'subsectionTitle' },
          {
            ul: voterProfile.topCities.map((item: any) => {
              const percentage = (item.count / voterProfile.totalContacts) * 100;
              return `${item.city}: ${percentage.toFixed(1)}% (${item.count})`;
            }),
            style: 'list'
          },
          { text: '', margin: [0, 10] }
        ] : []),

        ...(voterProfile.topSources && voterProfile.topSources.length > 0 ? [
          { text: 'Fontes de Cadastro', style: 'sectionTitle' },
          {
            ul: voterProfile.topSources.map((item: any) => {
              const percentage = (item.count / voterProfile.totalContacts) * 100;
              return `${item.source}: ${percentage.toFixed(1)}% (${item.count})`;
            }),
            style: 'list'
          },
          { text: '', margin: [0, 10] }
        ] : []),

        ...(voterProfile.genderDistribution && voterProfile.genderDistribution.counts ? [
          { text: 'Distribuição por Gênero', style: 'sectionTitle' },
          {
            ul: Object.entries(voterProfile.genderDistribution.counts)
              .filter(([_, count]) => (count as number) > 0)
              .map(([gender, count]) => {
                const percentage = voterProfile.genderDistribution.percentages[gender as keyof typeof voterProfile.genderDistribution.percentages];
                return `${gender}: ${percentage.toFixed(1)}% (${count})`;
              }),
            style: 'list'
          }
        ] : [])
      ],
      styles: {
        header: {
          fontSize: 14,
          bold: true,
          color: '#333333'
        },
        subheader: {
          fontSize: 10,
          color: '#666666'
        },
        sectionTitle: {
          fontSize: 14,
          bold: true,
          margin: [0, 10, 0, 5]
        },
        subsectionTitle: {
          fontSize: 11,
          bold: true,
          margin: [0, 5, 0, 3]
        },
        stat: {
          fontSize: 12,
          margin: [0, 0, 0, 5]
        },
        list: {
          fontSize: 10,
          margin: [0, 0, 0, 5]
        }
      }
    };

    pdfMake.createPdf(docDefinition).download(`perfil-eleitores-${new Date().toISOString().split('T')[0]}.pdf`);
    toast({ title: 'PDF do perfil gerado com sucesso!' });
    setIsProfileExportDialogOpen(false);
  };

  const executeExportProfileExcel = async () => {
    if (!voterProfile || voterProfile.totalContacts === 0) {
      toast({ title: "Nenhum dado de perfil para exportar", variant: "destructive" });
      return;
    }

    const worksheetData: any[][] = [
      ['PERFIL DOS ELEITORES'],
      [''],
      ['ESTATÍSTICAS PRINCIPAIS'],
      ['Total de eleitores', voterProfile.totalContacts],
    ];

    if (voterProfile.averageAge && voterProfile.totalContacts >= 3) {
      worksheetData.push(['Idade média', `${voterProfile.averageAge.toFixed(1)} anos`]);
    }

    worksheetData.push(['']);

    if (voterProfile.topInterests && voterProfile.topInterests.length > 0) {
      worksheetData.push([`TOP ${selectedTopCount} INTERESSES`]);
      voterProfile.topInterests.slice(0, selectedTopCount).forEach((item: any) => {
        worksheetData.push([item.interest, item.count]);
      });
      worksheetData.push(['']);
    }

    worksheetData.push(['DISTRIBUIÇÃO GEOGRÁFICA']);
    if (voterProfile.topStates && voterProfile.topStates.length > 0) {
      worksheetData.push(['Estados (Top 5)']);
      voterProfile.topStates.forEach((item: any) => {
        const percentage = (item.count / voterProfile.totalContacts) * 100;
        worksheetData.push([item.state, `${percentage.toFixed(1)}%`, item.count]);
      });
      worksheetData.push(['']);
    }

    if (voterProfile.topCities && voterProfile.topCities.length > 0) {
      worksheetData.push(['Cidades (Top 5)']);
      voterProfile.topCities.forEach((item: any) => {
        const percentage = (item.count / voterProfile.totalContacts) * 100;
        worksheetData.push([item.city, `${percentage.toFixed(1)}%`, item.count]);
      });
      worksheetData.push(['']);
    }

    if (voterProfile.topSources && voterProfile.topSources.length > 0) {
      worksheetData.push(['FONTES DE CADASTRO']);
      voterProfile.topSources.forEach((item: any) => {
        const percentage = (item.count / voterProfile.totalContacts) * 100;
        worksheetData.push([item.source, `${percentage.toFixed(1)}%`, item.count]);
      });
      worksheetData.push(['']);
    }

    if (voterProfile.genderDistribution && voterProfile.genderDistribution.counts) {
      worksheetData.push(['DISTRIBUIÇÃO POR GÊNERO']);
      Object.entries(voterProfile.genderDistribution.counts)
        .filter(([_, count]) => (count as number) > 0)
        .forEach(([gender, count]) => {
          const percentage = voterProfile.genderDistribution.percentages[gender as keyof typeof voterProfile.genderDistribution.percentages];
          worksheetData.push([gender, `${percentage.toFixed(1)}%`, count]);
        });
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(worksheetData);

    ws['!cols'] = [
      { wch: 30 },
      { wch: 15 },
      { wch: 15 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Perfil Eleitores');
    XLSX.writeFile(wb, `perfil-eleitores-${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: 'Excel do perfil gerado com sucesso!' });
    setIsProfileExportDialogOpen(false);
  };

  return (
    <div className="p-3 sm:p-6 md:p-8 space-y-4 sm:space-y-6">
      {/* Header - Mobile optimized */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-xl sm:text-3xl font-bold truncate">Eleitores</h1>
          <Badge variant="secondary" className="text-xs shrink-0" data-testid="text-contact-count">
            {contacts?.length || 0}
          </Badge>
        </div>
        
        {/* Mobile: Icon buttons in a row */}
        <div className="flex items-center gap-1 sm:gap-2">
          {currentUser?.role === 'voluntario' && (
            <Button 
              variant="outline"
              size="icon"
              className="h-8 w-8 sm:h-9 sm:w-9"
              onClick={() => setIsProfilePhotoDialogOpen(true)}
              data-testid="button-profile-photo"
              title="Minha Foto de Perfil"
            >
              <Camera className="w-4 h-4" />
            </Button>
          )}
          <Button 
            variant="outline"
            size="icon"
            className="h-8 w-8 sm:h-9 sm:w-9"
            onClick={() => setIsQrCodeDialogOpen(true)}
            data-testid="button-qr-code"
            title="Compartilhar QR Code de apoio"
          >
            <QrCode className="w-4 h-4" />
          </Button>
          {currentUser?.role !== 'voluntario' && (
            <>
              <Button 
                variant="outline"
                size="icon"
                className="h-8 w-8 sm:h-9 sm:w-9 hidden sm:flex"
                onClick={() => setIsProfileDialogOpen(true)}
                data-testid="button-voter-profile"
                title="Perfil Agregado dos Eleitores"
              >
                <UserCircle2 className="w-4 h-4" />
              </Button>
              <Button 
                variant="outline"
                size="icon"
                className="h-8 w-8 sm:h-9 sm:w-9 hidden sm:flex"
                onClick={handleBulkEmail}
                data-testid="button-bulk-email"
                title="Enviar email em massa"
              >
                <Send className="w-4 h-4" />
              </Button>
              <Button 
                variant="outline"
                size="icon"
                className="h-8 w-8 sm:h-9 sm:w-9 hidden sm:flex"
                onClick={handleCopyWhatsAppNumbers}
                data-testid="button-copy-whatsapp"
                title="Copiar números para WhatsApp Business"
              >
                <Copy className="w-4 h-4" />
              </Button>
              <Button 
                variant="outline"
                size="icon"
                className="h-8 w-8 sm:h-9 sm:w-9 hidden sm:flex"
                onClick={() => setIsExportDialogOpen(true)}
                data-testid="button-export"
                title="Exportar eleitores"
              >
                <Download className="w-4 h-4" />
              </Button>
              
              {/* Mobile: More options dropdown - Only for non-volunteers */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 sm:hidden"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setIsProfileDialogOpen(true)}>
                    <UserCircle2 className="w-4 h-4 mr-2" />
                    Perfil dos Eleitores
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleBulkEmail}>
                    <Send className="w-4 h-4 mr-2" />
                    Enviar email em massa
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleCopyWhatsAppNumbers}>
                    <Copy className="w-4 h-4 mr-2" />
                    Copiar WhatsApps
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsExportDialogOpen(true)}>
                    <Download className="w-4 h-4 mr-2" />
                    Exportar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
          <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
            <DialogContent className="max-w-md p-0">
              <DialogHeader className="px-5 pt-5 pb-3 border-b">
                <DialogTitle className="text-xl font-bold">Exportar Eleitores</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-1">
                  Selecione o formato para exportar <span className="font-semibold text-foreground">{filteredContacts?.length || 0}</span> eleitor(es)
                </DialogDescription>
              </DialogHeader>
              <div className="p-4">
                <div className="grid gap-3">
                  <Card 
                    className="cursor-pointer transition-all hover-elevate active-elevate-2 border-2 hover:border-primary/20"
                    onClick={() => requestProtectedAction("pdf")}
                    data-testid="button-export-pdf"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                          <FileText className="h-5 w-5 text-red-600 dark:text-red-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-semibold mb-0.5">Exportar como PDF</h3>
                          <p className="text-xs text-muted-foreground leading-snug">
                            Documento formatado com logo e dados prontos para impressão
                          </p>
                          <div className="flex items-center gap-1.5 mt-2">
                            <Badge variant="outline" className="font-normal text-[10px] px-1.5 py-0">
                              Somente leitura
                            </Badge>
                            <Badge variant="outline" className="font-normal text-[10px] px-1.5 py-0">
                              A4
                            </Badge>
                          </div>
                        </div>
                        <Download className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card 
                    className="cursor-pointer transition-all hover-elevate active-elevate-2 border-2 hover:border-primary/20"
                    onClick={() => requestProtectedAction("excel")}
                    data-testid="button-export-excel"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-green-50 dark:bg-green-950/30 flex items-center justify-center">
                          <Sheet className="h-5 w-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-semibold mb-0.5">Exportar como Excel</h3>
                          <p className="text-xs text-muted-foreground leading-snug">
                            Planilha editável otimizada para análise de dados
                          </p>
                          <div className="flex items-center gap-1.5 mt-2">
                            <Badge variant="outline" className="font-normal text-[10px] px-1.5 py-0">
                              Editável
                            </Badge>
                            <Badge variant="outline" className="font-normal text-[10px] px-1.5 py-0">
                              .xlsx
                            </Badge>
                          </div>
                        </div>
                        <Download className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={isQrCodeDialogOpen} onOpenChange={setIsQrCodeDialogOpen}>
            <DialogContent className="max-w-sm p-0">
              <DialogHeader className="px-4 pt-4 pb-3 border-b">
                <DialogTitle className="text-lg font-bold">QR Code de Apoio</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Compartilhe para que apoiadores se cadastrem
                </DialogDescription>
              </DialogHeader>
              <div className="p-4 space-y-3">
                {qrCodeSlug ? (
                  <>
                    <div className="flex justify-center items-center p-6 bg-white dark:bg-gray-100 rounded-2xl pt-[2px] pb-[2px] pl-[24px] pr-[24px] mt-[0px] mb-[0px]">
                      <div className="relative">
                        <div className="p-4 bg-white dark:bg-gray-100 rounded-xl">
                          <QRCodeSVG
                            value={`https://www.politicall.com.br/apoio/${qrCodeSlug}`}
                            size={200}
                            level="H"
                            includeMargin={false}
                          />
                        </div>
                        {qrCodeAvatar && (
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                            <div className="w-14 h-14 rounded-full bg-white dark:bg-gray-100 p-1 shadow-xl ring-4 ring-white/90">
                              <img 
                                src={qrCodeAvatar} 
                                alt={qrCodeName || 'Avatar'}
                                className="w-full h-full rounded-full object-cover"
                                data-testid="img-qr-avatar"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      {/* Botões de ação principais */}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(`https://www.politicall.com.br/apoio/${qrCodeSlug}`);
                            toast({ title: "URL copiada com sucesso!" });
                          }}
                          data-testid="button-copy-qr-url"
                        >
                          <Copy className="w-3.5 h-3.5 mr-1.5" />
                          Copiar URL
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1"
                          size="sm"
                          onClick={() => {
                            window.open(`https://www.politicall.com.br/apoio/${qrCodeSlug}`, '_blank');
                          }}
                          data-testid="button-open-qr-url"
                        >
                          <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                          Abrir
                        </Button>
                      </div>
                      
                      {/* Ícones de compartilhamento em redes sociais */}
                      <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground text-center">Compartilhar:</p>
                        <div className="flex justify-center gap-1.5">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-9 w-9 rounded-full"
                            onClick={() => {
                              const url = `https://www.politicall.com.br/apoio/${qrCodeSlug}`;
                              const text = `Declare seu apoio a ${qrCodeName}! Cadastre-se aqui:`;
                              window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`, '_blank');
                            }}
                            data-testid="button-share-whatsapp"
                            title="Compartilhar no WhatsApp"
                          >
                            <SiWhatsapp className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-9 w-9 rounded-full"
                            onClick={() => {
                              const url = `https://www.politicall.com.br/apoio/${qrCodeSlug}`;
                              window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
                            }}
                            data-testid="button-share-facebook"
                            title="Compartilhar no Facebook"
                          >
                            <SiFacebook className="h-4 w-4 text-blue-600" />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-9 w-9 rounded-full"
                            onClick={() => {
                              const url = `https://www.politicall.com.br/apoio/${qrCodeSlug}`;
                              const text = `Declare seu apoio a ${qrCodeName}!`;
                              window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
                            }}
                            data-testid="button-share-twitter"
                            title="Compartilhar no X (Twitter)"
                          >
                            <SiX className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-9 w-9 rounded-full"
                            onClick={() => {
                              const url = `https://www.politicall.com.br/apoio/${qrCodeSlug}`;
                              const subject = `Apoie ${qrCodeName}`;
                              const body = `Olá!\n\nConheça e declare seu apoio a ${qrCodeName}!\n\nAcesse: ${url}`;
                              window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                            }}
                            data-testid="button-share-email"
                            title="Compartilhar por Email"
                          >
                            <Mail className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-4 text-center space-y-2">
                    <div className="w-12 h-12 mx-auto bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
                      <QrCode className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Carregando QR Code...
                    </p>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={isProfilePhotoDialogOpen} onOpenChange={(open) => {
            setIsProfilePhotoDialogOpen(open);
            if (!open) {
              setProfilePhotoFile(null);
              setProfilePhotoPreview(null);
            }
          }}>
            <DialogContent className="max-w-sm p-0">
              <DialogHeader className="px-4 pt-4 pb-3 border-b">
                <DialogTitle className="text-lg font-bold">Minha Foto de Perfil</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Sua foto aparecerá na página de apoio
                </DialogDescription>
              </DialogHeader>
              <div className="p-4 space-y-4">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <img 
                      src={profilePhotoPreview || currentUser?.avatar || politicallIconUrl} 
                      alt="Preview"
                      className="w-32 h-32 rounded-full object-cover ring-4 ring-primary/20"
                      data-testid="img-profile-photo-preview"
                    />
                    {(profilePhotoPreview || currentUser?.avatar) && (
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute -top-1 -right-1 h-7 w-7 rounded-full shadow-md"
                        onClick={() => {
                          setProfilePhotoPreview(null);
                          setProfilePhotoFile(null);
                          if (currentUser?.avatar) {
                            profilePhotoMutation.mutate(null);
                          }
                        }}
                        data-testid="button-remove-profile-photo"
                        title="Remover foto"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-2 w-full">
                    <label htmlFor="profile-photo-input" className="w-full">
                      <Button 
                        variant="outline" 
                        className="w-full"
                        asChild
                      >
                        <span>
                          <Upload className="w-4 h-4 mr-2" />
                          Selecionar Foto
                        </span>
                      </Button>
                    </label>
                    <input 
                      id="profile-photo-input"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleProfilePhotoChange}
                      data-testid="input-profile-photo"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter className="px-4 py-3 border-t flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setIsProfilePhotoDialogOpen(false);
                    setProfilePhotoFile(null);
                    setProfilePhotoPreview(null);
                  }}
                  data-testid="button-cancel-profile-photo"
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleProfilePhotoSave}
                  disabled={!profilePhotoPreview || profilePhotoMutation.isPending}
                  data-testid="button-save-profile-photo"
                >
                  {profilePhotoMutation.isPending ? "Salvando..." : "Salvar Foto"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={isProfileDialogOpen} onOpenChange={setIsProfileDialogOpen}>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 [&>button]:hidden">
              <DialogHeader className="px-4 pt-4 pb-3 border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle className="text-lg font-bold">Perfil dos Eleitores</DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                      Análise agregada dos dados cadastrados
                    </DialogDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setIsProfileExportDialogOpen(true)}
                    data-testid="button-export-profile"
                    title="Exportar perfil"
                    className="h-8 w-8"
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto p-4">
                {voterProfile && voterProfile.totalContacts > 0 ? (
                  <div className="space-y-4">
                    <div className="bg-muted/30 rounded-lg p-4 shadow-sm">
                      <div className="flex items-center gap-1.5 mb-3">
                        <TrendingUp className="w-4 h-4 text-primary" />
                        <h3 className="text-sm font-semibold">Estatísticas Principais</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Total de eleitores</p>
                          <p className="text-2xl font-bold" data-testid="text-total-contacts">{voterProfile.totalContacts}</p>
                        </div>
                        {voterProfile.averageAge && voterProfile.totalContacts >= 3 && (
                          <div>
                            <p className="text-xs text-muted-foreground">Idade média</p>
                            <p className="text-2xl font-bold" data-testid="text-average-age">
                              {voterProfile.averageAge.toFixed(1)} anos
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <Separator />

                    {voterProfile.topInterests && voterProfile.topInterests.length > 0 && (
                      <>
                        <div className="bg-muted/30 rounded-lg p-4 shadow-sm">
                          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                            <div className="flex items-center gap-1.5">
                              <Info className="w-4 h-4 text-primary" />
                              <h3 className="text-sm font-semibold">
                                {selectedTopCount === 1 ? 'Interesse Mais Popular' : `Top ${selectedTopCount} Interesses`}
                              </h3>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((count) => (
                                <Button
                                  key={count}
                                  variant={selectedTopCount === count ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => setSelectedTopCount(count)}
                                  className="w-6 h-6 p-0 rounded-full text-xs"
                                  data-testid={`button-top-${count}`}
                                >
                                  {count}
                                </Button>
                              ))}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {voterProfile.topInterests.slice(0, selectedTopCount).map((item: { interest: string; count: number }) => {
                              const InterestIcon = INTEREST_ICONS[item.interest];
                              return (
                                <Badge 
                                  key={item.interest}
                                  className={`${getInterestColor(item.interest, true)} border-0 text-xs px-2 py-1 flex items-center gap-1 bg-transparent shadow-none`}
                                  data-testid={`badge-interest-${item.interest}`}
                                >
                                  {InterestIcon && <InterestIcon className="w-3 h-3" />}
                                  {item.interest} ({item.count})
                                </Badge>
                              );
                            })}
                          </div>
                        </div>
                        <Separator />
                      </>
                    )}

                    <div className="bg-muted/30 rounded-lg p-4 shadow-sm">
                      <div className="flex items-center gap-1.5 mb-3">
                        <MapPin className="w-4 h-4 text-primary" />
                        <h3 className="text-sm font-semibold">Distribuição Geográfica</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {voterProfile.topStates && voterProfile.topStates.length > 0 && (
                          <div>
                            <h4 className="text-xs font-medium mb-2 text-muted-foreground">Estados (Top 5)</h4>
                            <div className="space-y-1.5">
                              {voterProfile.topStates.map((item: { state: string; count: number }) => {
                                const percentage = (item.count / voterProfile.totalContacts) * 100;
                                return (
                                  <div key={item.state} className="space-y-0.5" data-testid={`state-${item.state}`}>
                                    <div className="flex justify-between items-center text-xs">
                                      <span className="font-medium">{item.state}</span>
                                      <span className="text-muted-foreground">{percentage.toFixed(1)}%</span>
                                    </div>
                                    <Progress value={percentage} className="h-1.5" />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {voterProfile.topCities && voterProfile.topCities.length > 0 && (
                          <div>
                            <h4 className="text-xs font-medium mb-2 text-muted-foreground">Cidades (Top 5)</h4>
                            <div className="space-y-1.5">
                              {voterProfile.topCities.map((item: { city: string; count: number }) => {
                                const percentage = (item.count / voterProfile.totalContacts) * 100;
                                return (
                                  <div key={item.city} className="space-y-0.5" data-testid={`city-${item.city}`}>
                                    <div className="flex justify-between items-center text-xs">
                                      <span className="font-medium">{item.city}</span>
                                      <span className="text-muted-foreground">{percentage.toFixed(1)}%</span>
                                    </div>
                                    <Progress value={percentage} className="h-1.5" />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {voterProfile.topSources && voterProfile.topSources.length > 0 && (
                      <>
                        <Separator />
                        <div className="bg-muted/30 rounded-lg p-4 shadow-sm">
                          <div className="flex items-center gap-1.5 mb-3">
                            <Users className="w-4 h-4 text-primary" />
                            <h3 className="text-sm font-semibold">Fontes de Cadastro</h3>
                          </div>
                          <div className="space-y-2">
                            {voterProfile.topSources.map((item: { source: string; count: number }) => {
                              const percentage = (item.count / voterProfile.totalContacts) * 100;
                              return (
                                <div key={item.source} className="space-y-0.5" data-testid={`source-${item.source}`}>
                                  <div className="flex justify-between items-center text-xs">
                                    <span className="font-medium">{item.source}</span>
                                    <span className="text-muted-foreground">{percentage.toFixed(1)}% ({item.count})</span>
                                  </div>
                                  <Progress value={percentage} className="h-1.5" />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}

                    {voterProfile.genderDistribution && voterProfile.genderDistribution.counts && (
                      <>
                        <Separator />
                        <div className="bg-muted/30 rounded-lg p-4 shadow-sm">
                          <div className="flex items-center gap-1.5 mb-3">
                            <Users className="w-4 h-4 text-primary" />
                            <h3 className="text-sm font-semibold">Distribuição por Gênero</h3>
                          </div>
                          <div className="space-y-2">
                            {Object.entries(voterProfile.genderDistribution.counts)
                              .filter(([_, count]) => (count as number) > 0)
                              .map(([gender, count]) => {
                                const percentage = voterProfile.genderDistribution.percentages[gender as keyof typeof voterProfile.genderDistribution.percentages];
                                const getGenderColor = (gender: string) => {
                                  if (gender === 'Masculino') return 'bg-blue-500';
                                  if (gender === 'Feminino') return 'bg-pink-500';
                                  if (gender === 'Não-binário') return 'bg-purple-500';
                                  return 'bg-gray-500';
                                };
                                
                                return (
                                  <div key={gender} className="space-y-0.5" data-testid={`gender-${gender}`}>
                                    <div className="flex justify-between items-center text-xs">
                                      <span className="font-medium">{gender}</span>
                                      <span className="text-muted-foreground">{percentage.toFixed(1)}% ({count})</span>
                                    </div>
                                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                                      <div 
                                        className={`h-full ${getGenderColor(gender)} transition-all duration-300`}
                                        style={{ width: `${percentage}%` }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="py-12 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
                      <UserCircle2 className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Cadastre mais eleitores para ver estatísticas detalhadas
                    </p>
                  </div>
                )}
              </div>
              <DialogFooter className="px-4 py-3 border-t">
                <Button
                  onClick={() => setIsProfileDialogOpen(false)}
                  className="w-full"
                  data-testid="button-close-profile"
                >
                  Fechar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={isProfileExportDialogOpen} onOpenChange={setIsProfileExportDialogOpen}>
            <DialogContent className="max-w-md p-0">
              <DialogHeader className="px-5 pt-5 pb-3 border-b">
                <DialogTitle className="text-xl font-bold">Exportar Perfil</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-1">
                  Selecione o formato para exportar o perfil dos eleitores
                </DialogDescription>
              </DialogHeader>
              <div className="p-4">
                <div className="grid gap-3">
                  <Card 
                    className="cursor-pointer transition-all hover-elevate active-elevate-2 border-2 hover:border-primary/20"
                    onClick={() => requestProtectedAction("profile-pdf")}
                    data-testid="button-export-profile-pdf"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                          <FileText className="h-5 w-5 text-red-600 dark:text-red-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-semibold mb-0.5">Exportar como PDF</h3>
                          <p className="text-xs text-muted-foreground leading-snug">
                            Documento formatado com estatísticas do perfil prontas para apresentação
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card 
                    className="cursor-pointer transition-all hover-elevate active-elevate-2 border-2 hover:border-primary/20"
                    onClick={() => requestProtectedAction("profile-excel")}
                    data-testid="button-export-profile-excel"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                          <Sheet className="h-5 w-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-semibold mb-0.5">Exportar como Excel</h3>
                          <p className="text-xs text-muted-foreground leading-snug">
                            Planilha editável com dados do perfil para análise detalhada
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          {currentUser?.role !== 'voluntario' && (
            <Button 
              variant="outline"
              size="icon"
              onClick={() => {
                resetImport();
                setIsImportDialogOpen(true);
              }}
              data-testid="button-import"
              title="Importar lista de contatos"
            >
              <Upload className="w-4 h-4" />
            </Button>
          )}
          <Dialog open={isImportDialogOpen} onOpenChange={(open) => {
            setIsImportDialogOpen(open);
            if (!open) resetImport();
          }}>
            <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0">
              <DialogHeader className="px-5 pt-5 pb-3 border-b">
                <DialogTitle className="text-xl font-bold">Importar Contatos</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-1">
                  Importe uma lista de contatos de qualquer formato (.xlsx, .xls, .csv, .pdf)
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto p-4">
                {!importFile && !importResult && (
                  <div className="space-y-4">
                    <div 
                      className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all hover:border-primary hover:bg-muted/30"
                      onClick={() => document.getElementById('import-file-input')?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.add('border-primary', 'bg-muted/30');
                      }}
                      onDragLeave={(e) => {
                        e.currentTarget.classList.remove('border-primary', 'bg-muted/30');
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('border-primary', 'bg-muted/30');
                        const file = e.dataTransfer.files[0];
                        if (file) handleFileUpload(file);
                      }}
                    >
                      <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                      <p className="text-sm font-medium mb-1">Arraste e solte ou clique para selecionar</p>
                      <p className="text-xs text-muted-foreground">Formatos aceitos: .xlsx, .xls, .csv, .pdf</p>
                    </div>
                    <input
                      id="import-file-input"
                      type="file"
                      accept=".xlsx,.xls,.csv,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                      }}
                      data-testid="input-import-file"
                    />
                    <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <Info className="w-4 h-4 text-primary" />
                        Dicas para importação
                      </h4>
                      <ul className="text-xs text-muted-foreground space-y-1 ml-6 list-disc">
                        <li>O arquivo deve ter uma coluna "Nome" ou similar</li>
                        <li>Colunas reconhecidas: Nome, Email, Telefone, Idade, Gênero, Estado, Cidade, Interesses, Fonte, Notas</li>
                        <li>Colunas não reconhecidas serão ignoradas</li>
                        <li>Formatos de telefone e gênero são normalizados automaticamente</li>
                      </ul>
                    </div>
                  </div>
                )}

                {importFile && !importResult && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                      {importFile.name.toLowerCase().endsWith('.pdf') ? (
                        <FileText className="w-8 h-8 text-red-600 dark:text-red-400" />
                      ) : (
                        <FileSpreadsheet className="w-8 h-8 text-green-600 dark:text-green-400" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{importFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(importFile.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={resetImport}
                        data-testid="button-remove-import-file"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>

                    {importErrors.length > 0 && (
                      <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                          <span className="text-sm font-medium text-red-800 dark:text-red-200">
                            {importPreview.length === 0 ? 'Erro' : 'Avisos'}
                          </span>
                        </div>
                        <ul className="text-xs text-red-700 dark:text-red-300 space-y-0.5 max-h-24 overflow-y-auto">
                          {importErrors.slice(0, 10).map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                          {importErrors.length > 10 && (
                            <li>... e mais {importErrors.length - 10} avisos</li>
                          )}
                        </ul>
                      </div>
                    )}

                    {importPreview.length > 0 && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                            {importPreview.length} contato(s) prontos para importar
                          </span>
                        </div>
                        
                        <div className="border rounded-lg overflow-hidden">
                          <div className="max-h-48 overflow-y-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-xs">Nome</TableHead>
                                  <TableHead className="text-xs">Email</TableHead>
                                  <TableHead className="text-xs">Telefone</TableHead>
                                  <TableHead className="text-xs">Cidade</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {importPreview.slice(0, 10).map((contact, i) => (
                                  <TableRow key={i}>
                                    <TableCell className="text-xs py-2">{contact.name}</TableCell>
                                    <TableCell className="text-xs py-2">{contact.email || '-'}</TableCell>
                                    <TableCell className="text-xs py-2">{contact.phone || '-'}</TableCell>
                                    <TableCell className="text-xs py-2">{contact.city || '-'}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                          {importPreview.length > 10 && (
                            <div className="text-center py-2 text-xs text-muted-foreground bg-muted/30 border-t">
                              ... e mais {importPreview.length - 10} contatos
                            </div>
                          )}
                        </div>

                        {isImporting && (
                          <div className="space-y-2">
                            <Progress value={importProgress} />
                            <p className="text-xs text-center text-muted-foreground">
                              Importando... {importProgress}%
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {importResult && (
                  <div className="space-y-4 text-center py-6">
                    <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${
                      importResult.errors === 0 ? 'bg-green-100 dark:bg-green-900/30' : 'bg-yellow-100 dark:bg-yellow-900/30'
                    }`}>
                      <CheckCircle2 className={`w-8 h-8 ${
                        importResult.errors === 0 ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'
                      }`} />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">Importação Concluída!</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {importResult.success} contato(s) importado(s) com sucesso
                        {importResult.errors > 0 && `, ${importResult.errors} erro(s)`}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter className="px-4 py-3 border-t flex gap-2">
                {importResult ? (
                  <Button
                    onClick={() => setIsImportDialogOpen(false)}
                    className="flex-1"
                    data-testid="button-close-import"
                  >
                    Fechar
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setIsImportDialogOpen(false)}
                      className="flex-1"
                      data-testid="button-cancel-import"
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={executeImport}
                      disabled={importPreview.length === 0 || isImporting}
                      className="flex-1"
                      data-testid="button-confirm-import"
                    >
                      {isImporting ? 'Importando...' : `Importar ${importPreview.length} contato(s)`}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingContact(null);
              form.reset();
            } else if (!editingContact && currentUser?.role === 'voluntario') {
              // Para voluntários criando novo contato, preencher fonte automaticamente
              form.setValue('source', `Vol. ${currentUser.name}`);
            }
          }}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-contact">
                <Plus className="w-4 h-4 mr-2" />
                Novo Contato
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b">
              <DialogTitle>
                {editingContact ? "Editar Contato" : "Novo Contato"}
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col flex-1 overflow-hidden">
                <div className="overflow-y-auto px-6 py-4 space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome *</FormLabel>
                        <FormControl>
                          <Input placeholder="Nome completo" data-testid="input-contact-name" {...field} />
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
                          <Input type="email" placeholder="email@exemplo.com" data-testid="input-contact-email" {...field} value={field.value || ""} />
                        </FormControl>
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
                          <Input placeholder="(00) 00000-0000" data-testid="input-contact-phone" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="age"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Idade</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="Ex: 35" 
                            data-testid="input-contact-age" 
                            {...field} 
                            value={field.value || ""} 
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="gender"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Gênero</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                          <FormControl>
                            <SelectTrigger data-testid="select-contact-gender">
                              <SelectValue placeholder="Selecione o gênero" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {GENDER_OPTIONS.map((gender) => (
                              <SelectItem key={gender} value={gender}>
                                {gender}
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
                    name="state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estado</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                          <FormControl>
                            <SelectTrigger data-testid="select-contact-state">
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
                            data-testid="input-contact-city"
                            list="contact-cities-list"
                            value={field.value || ""}
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                            onChange={(e) => {
                              const formatted = capitalizeWords(e.target.value);
                              field.onChange(formatted);
                            }}
                          />
                        </FormControl>
                        <datalist id="contact-cities-list">
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
                    name="interests"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Interesses e Hobbies</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                role="combobox"
                                className="w-full justify-between font-normal"
                                data-testid="button-select-interests"
                              >
                                {field.value && field.value.length > 0
                                  ? `${field.value.length} selecionado${field.value.length > 1 ? 's' : ''}`
                                  : "Selecione interesses"}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-full p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Buscar interesses..." />
                              <CommandList>
                                <CommandEmpty>Nenhum interesse encontrado.</CommandEmpty>
                                <CommandGroup className="max-h-64 overflow-auto">
                                  {CONTACT_INTERESTS.map((interest) => (
                                    <CommandItem
                                      key={interest}
                                      onSelect={() => {
                                        const currentValue = field.value || [];
                                        const newValue = currentValue.includes(interest)
                                          ? currentValue.filter((v) => v !== interest)
                                          : [...currentValue, interest];
                                        field.onChange(newValue);
                                      }}
                                    >
                                      <Check
                                        className={`mr-2 h-4 w-4 ${
                                          field.value?.includes(interest) ? "opacity-100" : "opacity-0"
                                        }`}
                                      />
                                      {interest}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        {field.value && field.value.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {field.value.map((interest) => (
                              <span
                                key={interest}
                                className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded-md"
                              >
                                {interest}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newValue = field.value?.filter((v) => v !== interest) || [];
                                    field.onChange(newValue);
                                  }}
                                  className="text-muted-foreground hover:text-foreground"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="source"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fonte</FormLabel>
                        {currentUser?.role === 'voluntario' && !editingContact ? (
                          <FormControl>
                            <Input 
                              value={`Vol. ${currentUser.name}`} 
                              disabled 
                              className="bg-muted"
                              data-testid="input-contact-source-volunteer"
                            />
                          </FormControl>
                        ) : (
                          <Select onValueChange={field.onChange} value={field.value || undefined}>
                            <FormControl>
                              <SelectTrigger data-testid="select-contact-source">
                                <SelectValue placeholder="Como foi feito o cadastro?" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {CONTACT_SOURCES.map((source) => (
                                <SelectItem key={source} value={source}>
                                  {source}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
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
                          <Textarea placeholder="Notas adicionais" data-testid="input-contact-notes" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <DialogFooter className="px-6 py-4 border-t grid grid-cols-1 gap-2">
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-contact" className="rounded-full w-full">
                    {(createMutation.isPending || updateMutation.isPending) ? "Salvando..." : "Salvar"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <Card className="border-0 sm:border shadow-none sm:shadow-sm">
        <CardHeader className="px-0 sm:px-6 pb-3 sm:pb-6">
          {/* All filters in one responsive row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-full sm:max-w-[300px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar eleitores..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
                className="pl-10 rounded-full w-full h-9"
                data-testid="input-search-contacts"
              />
            </div>
            
            {/* State Filter */}
            <Select 
              value={selectedState} 
              onValueChange={(value) => setSelectedState(value === "all" ? "" : value)}
              onOpenChange={(open) => setIsStateFocused(open)}
            >
              <SelectTrigger 
                className="rounded-full w-[120px] sm:w-[140px] h-9"
                data-testid="select-state-filter"
              >
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {states.map((state) => (
                  <SelectItem key={state} value={state}>{state}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* City Filter */}
            <Select 
              value={selectedCity} 
              onValueChange={(value) => setSelectedCity(value === "all" ? "" : value)}
              onOpenChange={(open) => setIsCityFocused(open)}
            >
              <SelectTrigger 
                className="rounded-full w-[120px] sm:w-[140px] h-9"
                data-testid="select-city-filter"
              >
                <SelectValue placeholder="Cidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {cities.map((city) => (
                  <SelectItem key={city} value={city}>{city}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Interest Filter */}
            <Select 
              value={selectedInterest} 
              onValueChange={(value) => setSelectedInterest(value === "all" ? "" : value)}
              onOpenChange={(open) => setIsInterestFocused(open)}
            >
              <SelectTrigger 
                className="rounded-full w-[120px] sm:w-[140px] h-9"
                data-testid="select-interest-filter"
              >
                <SelectValue placeholder="Interesse" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {CONTACT_INTERESTS.map((interest) => (
                  <SelectItem key={interest} value={interest}>{interest}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Source Filter */}
            <Select 
              value={selectedSource} 
              onValueChange={(value) => setSelectedSource(value === "all" ? "" : value)}
              onOpenChange={(open) => setIsSourceFocused(open)}
            >
              <SelectTrigger 
                className="rounded-full w-[120px] sm:w-[140px] h-9"
                data-testid="select-source-filter"
              >
                <SelectValue placeholder="Fonte" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {sources.map((source) => (
                  <SelectItem key={source} value={source}>{source}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Clear filters button */}
            {(selectedState || selectedCity || selectedInterest || selectedSource) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-2 text-muted-foreground"
                onClick={() => {
                  setSelectedState("");
                  setSelectedCity("");
                  setSelectedInterest("");
                  setSelectedSource("");
                }}
                data-testid="button-clear-filters"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          {isLoading ? (
            <div className="space-y-3 px-3 sm:px-0">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 sm:h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <>
            {/* Bulk action bar */}
            {selectedContacts.size > 0 && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 mb-3 mx-3 sm:mx-0 bg-primary/10 rounded-lg border border-primary/20 gap-2">
                <span className="text-sm font-medium">
                  {selectedContacts.size} contato(s) selecionado(s)
                </span>
                <div className="flex gap-2 w-full sm:w-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 sm:flex-none"
                    onClick={() => setSelectedContacts(new Set())}
                    data-testid="button-clear-selection"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Limpar
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1 sm:flex-none"
                    onClick={() => setIsBulkDeleteDialogOpen(true)}
                    data-testid="button-bulk-delete"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Excluir
                  </Button>
                </div>
              </div>
            )}
            
            {/* Mobile: Card layout */}
            <div className="sm:hidden space-y-2 px-3">
              {filteredContacts && filteredContacts.length > 0 ? (
                filteredContacts.map((contact) => (
                  <div 
                    key={contact.id} 
                    className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl border"
                    data-testid={`card-contact-${contact.id}`}
                  >
                    <Checkbox
                      checked={selectedContacts.has(contact.id)}
                      onCheckedChange={() => toggleSelectContact(contact.id)}
                      className="shrink-0"
                      data-testid={`checkbox-contact-${contact.id}`}
                    />
                    <div className="flex-1 min-w-0" onClick={() => handleEdit(contact)}>
                      <p className="font-medium text-sm truncate">{formatName(contact.name)}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {contact.source && (
                          <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                            {contact.source}
                          </span>
                        )}
                        {contact.interests && contact.interests.length > 0 && (
                          <div className="flex gap-0.5">
                            {contact.interests.slice(0, 3).map((interest, idx) => {
                              const IconComponent = INTEREST_ICONS[interest] || Globe2;
                              return (
                                <div 
                                  key={idx}
                                  className={`p-1 rounded ${getInterestColor(interest)}`}
                                  title={interest}
                                >
                                  <IconComponent className="h-3 w-3" />
                                </div>
                              );
                            })}
                            {contact.interests.length > 3 && (
                              <span className="text-xs text-muted-foreground ml-1">
                                +{contact.interests.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {contact.phone && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            const cleanPhone = contact.phone!.replace(/\D/g, '');
                            window.open(`https://wa.me/55${cleanPhone}`, '_blank');
                          }}
                        >
                          <MessageCircle className="h-4 w-4 text-green-600" />
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            data-testid={`button-actions-${contact.id}`}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {contact.email && (
                            <DropdownMenuItem
                              onClick={() => window.location.href = `mailto:${contact.email}`}
                            >
                              <Mail className="h-4 w-4 mr-2" />
                              Enviar email
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleEdit(contact)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(contact.id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-muted-foreground py-12">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">{searchQuery ? "Nenhum contato encontrado" : "Nenhum contato cadastrado"}</p>
                </div>
              )}
            </div>

            {/* Desktop: Table layout */}
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={filteredContacts && filteredContacts.length > 0 && selectedContacts.size === filteredContacts.length}
                        onCheckedChange={toggleSelectAll}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Interesses</TableHead>
                    <TableHead>Fonte</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContacts && filteredContacts.length > 0 ? (
                    filteredContacts.map((contact) => (
                      <TableRow key={contact.id} data-testid={`row-contact-${contact.id}`}>
                        <TableCell>
                          <Checkbox
                            checked={selectedContacts.has(contact.id)}
                            onCheckedChange={() => toggleSelectContact(contact.id)}
                            data-testid={`checkbox-contact-${contact.id}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{formatName(contact.name)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {contact.interests && contact.interests.length > 0 ? (
                              contact.interests.map((interest, idx) => {
                                const IconComponent = INTEREST_ICONS[interest] || Globe2;
                                return (
                                  <Badge 
                                    key={idx} 
                                    variant="outline" 
                                    className={`text-xs p-1.5 ${getInterestColor(interest)}`}
                                    title={interest}
                                  >
                                    <IconComponent className="h-3.5 w-3.5" />
                                  </Badge>
                                );
                              })
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {contact.source ? (
                            <span className="text-sm">{contact.source}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                data-testid={`button-actions-${contact.id}`}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {contact.email && (
                                <DropdownMenuItem
                                  onClick={() => window.location.href = `mailto:${contact.email}`}
                                  data-testid={`button-email-${contact.id}`}
                                >
                                  <Mail className="h-4 w-4 mr-2" />
                                  Enviar email
                                </DropdownMenuItem>
                              )}
                              {contact.phone && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    const cleanPhone = contact.phone!.replace(/\D/g, '');
                                    window.open(`https://wa.me/55${cleanPhone}`, '_blank');
                                  }}
                                  data-testid={`button-whatsapp-${contact.id}`}
                                >
                                  <MessageCircle className="h-4 w-4 mr-2" />
                                  Abrir WhatsApp
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleEdit(contact)}
                                data-testid={`button-edit-${contact.id}`}
                              >
                                <Pencil className="h-4 w-4 mr-2" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(contact.id)}
                                data-testid={`button-delete-${contact.id}`}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        {searchQuery ? "Nenhum contato encontrado" : "Nenhum contato cadastrado"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Password Confirmation Dialog for Exports */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={(open) => {
        setIsPasswordDialogOpen(open);
        if (!open) {
          setExportPassword("");
          setPendingExportType(null);
        }
      }}>
        <DialogContent className="max-w-sm p-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Lock className="w-5 h-5 text-primary" />
              Confirmação de Segurança
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              Digite a senha do administrador da conta para autorizar a exportação
            </DialogDescription>
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
                    validatePasswordAndExport();
                  }
                }}
                data-testid="input-export-password"
              />
              <p className="text-xs text-muted-foreground">
                Somente o administrador ou usuários autorizados podem exportar dados
              </p>
            </div>
          </div>
          <DialogFooter className="px-5 py-4 border-t gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsPasswordDialogOpen(false);
                setExportPassword("");
                setPendingExportType(null);
              }}
              className="flex-1"
              data-testid="button-cancel-export"
            >
              Cancelar
            </Button>
            <Button
              onClick={validatePasswordAndExport}
              disabled={isValidatingPassword || !exportPassword.trim()}
              className="flex-1"
              data-testid="button-confirm-export"
            >
              {isValidatingPassword ? "Validando..." : "Exportar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={isBulkDeleteDialogOpen} onOpenChange={(open) => {
        setIsBulkDeleteDialogOpen(open);
        if (!open) {
          setBulkDeletePassword("");
        }
      }}>
        <DialogContent className="max-w-sm p-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b">
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Excluir {selectedContacts.size} Contato(s)
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              Esta ação é irreversível. Digite a senha do administrador para confirmar.
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 space-y-4">
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              <p className="text-sm text-destructive font-medium">
                Você está prestes a excluir {selectedContacts.size} contato(s) permanentemente.
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Senha do Administrador</label>
              <Input
                type="password"
                placeholder="Digite a senha"
                value={bulkDeletePassword}
                onChange={(e) => setBulkDeletePassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    validateBulkDeletePassword();
                  }
                }}
                data-testid="input-bulk-delete-password"
              />
            </div>
          </div>
          <DialogFooter className="px-5 py-4 border-t gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsBulkDeleteDialogOpen(false);
                setBulkDeletePassword("");
              }}
              className="flex-1"
              data-testid="button-cancel-bulk-delete"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={validateBulkDeletePassword}
              disabled={isBulkDeleting || !bulkDeletePassword.trim()}
              className="flex-1"
              data-testid="button-confirm-bulk-delete"
            >
              {isBulkDeleting ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Email Modal with Blocks */}
      <Dialog open={isBulkEmailModalOpen} onOpenChange={setIsBulkEmailModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] p-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              Envio de Email em Massa
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              Selecione o limite de envios por bloco e clique em cada bloco para enviar.
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-center gap-2">
              <span className="text-sm font-medium whitespace-nowrap">Limite por bloco:</span>
              <div className="flex items-center rounded-full border border-border p-1 gap-1">
                <button
                  type="button"
                  onClick={() => handleBlockSizeChange("30")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    emailBlockSize === 30
                      ? "border-2 border-green-500 text-green-700 dark:text-green-400"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="button-block-size-30"
                >
                  30 - Seguro
                </button>
                <button
                  type="button"
                  onClick={() => handleBlockSizeChange("100")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    emailBlockSize === 100
                      ? "border-2 border-yellow-500 text-yellow-700 dark:text-yellow-400"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="button-block-size-100"
                >
                  100 - Risco Médio
                </button>
                <button
                  type="button"
                  onClick={() => handleBlockSizeChange("0")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    emailBlockSize === 0
                      ? "border-2 border-red-500 text-red-700 dark:text-red-400"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="button-block-size-unlimited"
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
                Total: {contacts?.filter(c => c.email).length || 0} emails
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={resetEmailBlocks}
                disabled={sentEmailBlocks.size === 0}
                data-testid="button-reset-email-blocks"
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
                    data-testid={`email-block-${index}`}
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
                          Emails {block.startIndex} - {block.endIndex} ({block.emails.length} contatos)
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
                          data-testid={`button-send-block-${index}`}
                        >
                          {isSending ? (
                            <>
                              <span className="animate-spin mr-1">⏳</span>
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
                  <p>Nenhum contato com email cadastrado</p>
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
                  {contacts?.filter(c => c.email).length || 0} emails disparados com sucesso
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="px-5 py-4 border-t">
            <Button
              variant="outline"
              onClick={() => setIsBulkEmailModalOpen(false)}
              className="w-full"
              data-testid="button-close-bulk-email"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
