import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type Contact, type InsertContact, insertContactSchema, CONTACT_INTERESTS } from "@shared/schema";
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
import { Plus, Search, Pencil, Trash2, Mail, MessageCircle, Send, Copy, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check } from "lucide-react";

const BRAZILIAN_STATES = [
  "Acre", "Alagoas", "Amapá", "Amazonas", "Bahia", "Ceará", "Distrito Federal",
  "Espírito Santo", "Goiás", "Maranhão", "Mato Grosso", "Mato Grosso do Sul",
  "Minas Gerais", "Pará", "Paraíba", "Paraná", "Pernambuco", "Piauí",
  "Rio de Janeiro", "Rio Grande do Norte", "Rio Grande do Sul", "Rondônia",
  "Roraima", "Santa Catarina", "São Paulo", "Sergipe", "Tocantins"
];

export default function Contacts() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState<string>("");
  const [selectedState, setSelectedState] = useState<string>("");
  const [selectedInterest, setSelectedInterest] = useState<string>("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const { toast } = useToast();

  const { data: contacts, isLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const form = useForm<InsertContact>({
    resolver: zodResolver(insertContactSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      state: "",
      city: "",
      interests: [],
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

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Eleitores</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button 
            variant="outline"
            onClick={handleBulkEmail}
            data-testid="button-bulk-email"
            title="Enviar email em massa"
          >
            <Send className="w-4 h-4 mr-2" />
            Email em Massa
          </Button>
          <Button 
            variant="outline"
            onClick={handleCopyWhatsAppNumbers}
            data-testid="button-copy-whatsapp"
            title="Copiar números para WhatsApp Business"
          >
            <Copy className="w-4 h-4 mr-2" />
            Copiar WhatsApp
          </Button>
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
            <div className={`relative flex-1 w-full transition-all duration-300 ${isSearchFocused ? 'md:max-w-2xl' : 'md:max-w-md'}`}>
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar contatos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
                className="pl-10 rounded-full"
                data-testid="input-search-contacts"
              />
            </div>
            <Select value={selectedState} onValueChange={(value) => setSelectedState(value === "all" ? "" : value)}>
              <SelectTrigger className={`rounded-full transition-all duration-300 ${isSearchFocused ? 'w-[120px]' : 'w-[180px]'}`} data-testid="select-state-filter">
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
            <Select value={selectedCity} onValueChange={(value) => setSelectedCity(value === "all" ? "" : value)}>
              <SelectTrigger className={`rounded-full transition-all duration-300 ${isSearchFocused ? 'w-[120px]' : 'w-[180px]'}`} data-testid="select-city-filter">
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
            <Select value={selectedInterest} onValueChange={(value) => setSelectedInterest(value === "all" ? "" : value)}>
              <SelectTrigger className={`rounded-full transition-all duration-300 ${isSearchFocused ? 'w-[120px]' : 'w-[180px]'}`} data-testid="select-interest-filter">
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
            <div className="text-sm text-muted-foreground" data-testid="text-contact-count">
              {(searchQuery || selectedCity || selectedState || selectedInterest) && filteredContacts ? (
                <span>{filteredContacts.length} de {contacts?.length || 0} contatos</span>
              ) : (
                <span>{contacts?.length || 0} contatos</span>
              )}
            </div>
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
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContacts && filteredContacts.length > 0 ? (
                  filteredContacts.map((contact) => (
                    <TableRow key={contact.id} data-testid={`row-contact-${contact.id}`}>
                      <TableCell className="font-medium">{contact.name}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {contact.interests && contact.interests.length > 0 ? (
                            contact.interests.map((interest, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {interest}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {contact.email && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => window.location.href = `mailto:${contact.email}`}
                              data-testid={`button-email-${contact.id}`}
                              title="Enviar email"
                            >
                              <Mail className="h-4 w-4" />
                            </Button>
                          )}
                          {contact.phone && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                const cleanPhone = contact.phone!.replace(/\D/g, '');
                                window.open(`https://wa.me/55${cleanPhone}`, '_blank');
                              }}
                              data-testid={`button-whatsapp-${contact.id}`}
                              title="Abrir WhatsApp"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(contact)}
                            data-testid={`button-edit-${contact.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(contact.id)}
                            data-testid={`button-delete-${contact.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
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
