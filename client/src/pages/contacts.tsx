import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type Contact, type InsertContact, insertContactSchema, CONTACT_INTERESTS, CONTACT_SOURCES } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Calendar as CalendarIcon, Star, Mic2, ShoppingCart, Download, FileText, Sheet, MoreVertical, QrCode, Share2
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
import pdfMake from "pdfmake/build/pdfmake";
import * as pdfFonts from "pdfmake/build/vfs_fonts";
import * as XLSX from 'xlsx';
import logoUrl from "@assets/logo pol_1763308638963_1763559095972.png";
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

// Função para gerar cor consistente baseada no nome do interesse
const getInterestColor = (interest: string): string => {
  let hash = 0;
  for (let i = 0; i < interest.length; i++) {
    hash = interest.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % INTEREST_COLORS.length;
  return INTEREST_COLORS[index];
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
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isQrCodeDialogOpen, setIsQrCodeDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isStateFocused, setIsStateFocused] = useState(false);
  const [isCityFocused, setIsCityFocused] = useState(false);
  const [isInterestFocused, setIsInterestFocused] = useState(false);
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
  const qrCodeSlug = currentUser?.role === 'admin' ? currentUser?.slug : adminData?.slug;
  const qrCodeName = currentUser?.role === 'admin' ? currentUser?.name : adminData?.name;

  const form = useForm<InsertContact>({
    resolver: zodResolver(insertContactSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
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

  const handleSubmit = (data: InsertContact) => {
    if (editingContact) {
      updateMutation.mutate({ id: editingContact.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (contact: Contact) => {
    setEditingContact(contact);
    form.reset({
      name: contact.name,
      email: contact.email || "",
      phone: contact.phone || "",
      state: contact.state || "",
      city: contact.city || "",
      interests: contact.interests || [],
      notes: contact.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Tem certeza que deseja excluir este contato?")) {
      deleteMutation.mutate(id);
    }
  };

  // Filter contacts based on search query, city, state, and interests
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
      
      return matchesSearch && matchesCity && matchesState && matchesInterest;
    });
  }, [contacts, searchQuery, selectedCity, selectedState, selectedInterest]);

  const handleBulkEmail = () => {
    const emailAddresses = contacts?.filter(c => c.email).map(c => c.email).join(',');
    if (!emailAddresses) {
      toast({ title: "Nenhum contato com email", variant: "destructive" });
      return;
    }
    window.location.href = `mailto:?bcc=${emailAddresses}`;
  };

  const handleCopyWhatsAppNumbers = () => {
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

  const handleExportPDF = async () => {
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

  const handleExportExcel = async () => {
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

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">Eleitores</h1>
          <span className="text-xs text-muted-foreground" data-testid="text-contact-count">
            {contacts?.length || 0} {(contacts?.length || 0) === 1 ? 'eleitor' : 'eleitores'}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button 
            variant="outline"
            size="icon"
            onClick={() => setIsQrCodeDialogOpen(true)}
            data-testid="button-qr-code"
            title="Compartilhar QR Code de apoio"
          >
            <QrCode className="w-4 h-4" />
          </Button>
          <Button 
            variant="outline"
            size="icon"
            onClick={handleBulkEmail}
            data-testid="button-bulk-email"
            title="Enviar email em massa"
          >
            <Send className="w-4 h-4" />
          </Button>
          <Button 
            variant="outline"
            size="icon"
            onClick={handleCopyWhatsAppNumbers}
            data-testid="button-copy-whatsapp"
            title="Copiar números para WhatsApp Business"
          >
            <Copy className="w-4 h-4" />
          </Button>
          <Button 
            variant="outline"
            size="icon"
            onClick={() => setIsExportDialogOpen(true)}
            data-testid="button-export"
            title="Exportar eleitores"
          >
            <Download className="w-4 h-4" />
          </Button>
          <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
            <DialogContent className="max-w-md p-0" aria-describedby="export-dialog-description">
              <DialogHeader className="px-5 pt-5 pb-3 border-b">
                <DialogTitle className="text-xl font-bold">Exportar Eleitores</DialogTitle>
                <p id="export-dialog-description" className="text-xs text-muted-foreground mt-1">
                  Selecione o formato para exportar <span className="font-semibold text-foreground">{filteredContacts?.length || 0}</span> eleitor(es)
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
                    onClick={handleExportExcel}
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
            <DialogContent className="max-w-md p-0" aria-describedby="qr-code-dialog-description">
              <DialogHeader className="px-6 pt-6 pb-4 border-b">
                <DialogTitle className="text-xl font-bold">QR Code de Apoio</DialogTitle>
                <p id="qr-code-dialog-description" className="text-sm text-muted-foreground mt-1">
                  Compartilhe este QR Code para que apoiadores se cadastrem automaticamente
                </p>
              </DialogHeader>
              <div className="p-6 space-y-6">
                {qrCodeSlug ? (
                  <>
                    <div className="flex justify-center p-6 bg-white dark:bg-gray-100 rounded-lg">
                      <QRCodeSVG
                        value={`https://www.politicall.com.br/apoio/${qrCodeSlug}`}
                        size={256}
                        level="H"
                        includeMargin={true}
                      />
                    </div>
                    <div className="space-y-3">
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">URL de Cadastro Público:</p>
                        <p className="text-sm font-mono break-all font-semibold">
                          www.politicall.com.br/apoio/{qrCodeSlug}
                        </p>
                      </div>
                      
                      {/* Botões de ação principais */}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => {
                            navigator.clipboard.writeText(`https://www.politicall.com.br/apoio/${qrCodeSlug}`);
                            toast({ title: "URL copiada com sucesso!" });
                          }}
                          data-testid="button-copy-qr-url"
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          Copiar URL
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => {
                            const svg = document.querySelector('#qr-code-dialog-description')?.parentElement?.parentElement?.querySelector('svg');
                            if (svg) {
                              const svgData = new XMLSerializer().serializeToString(svg);
                              const canvas = document.createElement('canvas');
                              const ctx = canvas.getContext('2d');
                              const img = new Image();
                              img.onload = () => {
                                canvas.width = img.width;
                                canvas.height = img.height;
                                ctx?.drawImage(img, 0, 0);
                                const pngFile = canvas.toDataURL('image/png');
                                const downloadLink = document.createElement('a');
                                downloadLink.download = `qr-code-apoio-${qrCodeSlug}.png`;
                                downloadLink.href = pngFile;
                                downloadLink.click();
                              };
                              img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
                            }
                            toast({ title: "QR Code baixado com sucesso!" });
                          }}
                          data-testid="button-download-qr"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Baixar
                        </Button>
                      </div>
                      
                      {/* Ícones de compartilhamento em redes sociais */}
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground text-center">Compartilhar em:</p>
                        <div className="flex justify-center gap-2">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-10 w-10 rounded-full"
                            onClick={() => {
                              const url = `https://www.politicall.com.br/apoio/${qrCodeSlug}`;
                              const text = `Declare seu apoio a ${qrCodeName}! Cadastre-se aqui:`;
                              window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`, '_blank');
                            }}
                            data-testid="button-share-whatsapp"
                            title="Compartilhar no WhatsApp"
                          >
                            <SiWhatsapp className="h-5 w-5 text-green-600" />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-10 w-10 rounded-full"
                            onClick={() => {
                              const url = `https://www.politicall.com.br/apoio/${qrCodeSlug}`;
                              window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
                            }}
                            data-testid="button-share-facebook"
                            title="Compartilhar no Facebook"
                          >
                            <SiFacebook className="h-5 w-5 text-blue-600" />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-10 w-10 rounded-full"
                            onClick={() => {
                              const url = `https://www.politicall.com.br/apoio/${qrCodeSlug}`;
                              const text = `Declare seu apoio a ${qrCodeName}!`;
                              window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
                            }}
                            data-testid="button-share-twitter"
                            title="Compartilhar no X (Twitter)"
                          >
                            <SiX className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-10 w-10 rounded-full"
                            onClick={() => {
                              const url = `https://www.politicall.com.br/apoio/${qrCodeSlug}`;
                              const subject = `Apoie ${qrCodeName}`;
                              const body = `Olá!\n\nConheça e declare seu apoio a ${qrCodeName}!\n\nAcesse: ${url}`;
                              window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                            }}
                            data-testid="button-share-email"
                            title="Compartilhar por Email"
                          >
                            <Mail className="h-5 w-5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                      <p className="text-xs text-blue-800 dark:text-blue-200">
                        <strong>Como funciona:</strong> Quando alguém escanear este QR Code ou acessar a URL, 
                        verá uma página profissional com sua foto e poderá se cadastrar como apoiador automaticamente, 
                        sem precisar de login no sistema.
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="p-6 text-center space-y-3">
                    <div className="w-16 h-16 mx-auto bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
                      <QrCode className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Carregando QR Code...
                    </p>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingContact(null);
              form.reset();
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
      <Card>
        <CardHeader>
          <div className="flex flex-wrap md:flex-nowrap items-center gap-4">
            <div className="relative transition-all duration-300 ease-in-out" style={{
              width: isSearchFocused 
                ? '600px' 
                : (isStateFocused || isCityFocused || isInterestFocused) 
                  ? '200px' 
                  : '350px'
            }}>
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar contatos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
                className="pl-10 rounded-full w-full"
                data-testid="input-search-contacts"
              />
            </div>
            <Select 
              value={selectedState} 
              onValueChange={(value) => setSelectedState(value === "all" ? "" : value)}
              onOpenChange={(open) => setIsStateFocused(open)}
            >
              <SelectTrigger 
                className={`rounded-full transition-all duration-300 ${isStateFocused ? 'w-[240px]' : 'w-[180px]'}`} 
                data-testid="select-state-filter"
              >
                <SelectValue placeholder="Estados" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os estados</SelectItem>
                {states.map((state) => (
                  <SelectItem key={state} value={state}>
                    {state}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select 
              value={selectedCity} 
              onValueChange={(value) => setSelectedCity(value === "all" ? "" : value)}
              onOpenChange={(open) => setIsCityFocused(open)}
            >
              <SelectTrigger 
                className={`rounded-full transition-all duration-300 ${isCityFocused ? 'w-[240px]' : 'w-[180px]'}`} 
                data-testid="select-city-filter"
              >
                <SelectValue placeholder="Cidades" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as cidades</SelectItem>
                {cities.map((city) => (
                  <SelectItem key={city} value={city}>
                    {city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select 
              value={selectedInterest} 
              onValueChange={(value) => setSelectedInterest(value === "all" ? "" : value)}
              onOpenChange={(open) => setIsInterestFocused(open)}
            >
              <SelectTrigger 
                className={`rounded-full transition-all duration-300 ${isInterestFocused ? 'w-[240px]' : 'w-[180px]'}`} 
                data-testid="select-interest-filter"
              >
                <SelectValue placeholder="Interesses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os interesses</SelectItem>
                {CONTACT_INTERESTS.map((interest) => (
                  <SelectItem key={interest} value={interest}>
                    {interest}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
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
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      {searchQuery ? "Nenhum contato encontrado" : "Nenhum contato cadastrado"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
