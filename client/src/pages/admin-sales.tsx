import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ArrowLeft, DollarSign, User, Calendar, Filter } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Account {
  id: string;
  name: string;
  salesperson: string | null;
  planValue: string | null;
  paymentStatus: string | null;
  commissionPaid: boolean | null;
  createdAt: string;
}

interface AdminSalesProps {
  onBack: () => void;
}

export default function AdminSales({ onBack }: AdminSalesProps) {
  const [selectedVendor, setSelectedVendor] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  
  const formatDateInput = (value: string): string => {
    const digits = value.replace(/\D/g, "");
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
  };

  const parseDate = (dateStr: string): Date | null => {
    if (!dateStr || dateStr.length !== 10) return null;
    const [day, month, year] = dateStr.split("/").map(Number);
    if (!day || !month || !year) return null;
    return new Date(year, month - 1, day);
  };
  
  const { data: accounts = [], isLoading } = useQuery<Account[]>({
    queryKey: ["/api/admin/sales"],
    queryFn: async () => {
      const token = localStorage.getItem("admin_token");
      const response = await fetch("/api/admin/sales", {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) throw new Error("Failed to fetch sales");
      return response.json();
    },
  });

  const vendors = useMemo(() => {
    const vendorSet = new Set<string>();
    accounts.forEach(a => {
      if (a.salesperson) vendorSet.add(a.salesperson);
    });
    return Array.from(vendorSet).sort();
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    let filtered = accounts;
    
    if (selectedVendor === "no_vendor") {
      filtered = filtered.filter(a => !a.salesperson);
    } else if (selectedVendor !== "all") {
      filtered = filtered.filter(a => a.salesperson === selectedVendor);
    }
    
    const start = parseDate(startDate);
    const end = parseDate(endDate);
    
    if (start) {
      filtered = filtered.filter(a => {
        const accountDate = new Date(a.createdAt);
        return accountDate >= start;
      });
    }
    
    if (end) {
      const endOfDay = new Date(end);
      endOfDay.setHours(23, 59, 59, 999);
      filtered = filtered.filter(a => {
        const accountDate = new Date(a.createdAt);
        return accountDate <= endOfDay;
      });
    }
    
    return filtered;
  }, [accounts, selectedVendor, startDate, endDate]);

  const updateMutation = useMutation({
    mutationFn: async ({ id, paymentStatus, commissionPaid }: { id: string; paymentStatus: string; commissionPaid: boolean }) => {
      const token = localStorage.getItem("admin_token");
      const response = await fetch(`/api/admin/sales/${id}`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ paymentStatus, commissionPaid }),
      });
      if (!response.ok) throw new Error("Failed to update sale");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sales"] });
    },
  });

  const handleStatusChange = (account: Account, paymentStatus: string) => {
    updateMutation.mutate({
      id: account.id,
      paymentStatus,
      commissionPaid: account.commissionPaid || false,
    });
  };

  const handleCommissionChange = (account: Account, commissionPaid: boolean) => {
    updateMutation.mutate({
      id: account.id,
      paymentStatus: account.paymentStatus || "pending",
      commissionPaid,
    });
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "paid":
        return <Badge className="bg-green-500">Cliente Pagou</Badge>;
      case "free":
        return <Badge className="bg-blue-500">Plano Gratuito</Badge>;
      default:
        return <Badge variant="secondary">Pendente</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-4 flex-1">
          <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-sales">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Vendas</h1>
            <p className="text-muted-foreground">Acompanhamento de vendas e comissões</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={selectedVendor} onValueChange={setSelectedVendor}>
            <SelectTrigger className="w-[160px]" data-testid="select-vendor-filter">
              <SelectValue placeholder="Vendedor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="no_vendor">Sem vendedor</SelectItem>
              {vendors.map(vendor => (
                <SelectItem key={vendor} value={vendor}>{vendor}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Período:</span>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="DD/MM/AAAA"
            value={startDate}
            onChange={(e) => setStartDate(formatDateInput(e.target.value))}
            maxLength={10}
            className="w-[130px]"
            data-testid="input-start-date"
          />
          <span className="text-muted-foreground">até</span>
          <Input
            placeholder="DD/MM/AAAA"
            value={endDate}
            onChange={(e) => setEndDate(formatDateInput(e.target.value))}
            maxLength={10}
            className="w-[130px]"
            data-testid="input-end-date"
          />
          {(startDate || endDate) && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => { setStartDate(""); setEndDate(""); }}
              data-testid="button-clear-dates"
            >
              Limpar
            </Button>
          )}
        </div>
      </div>

      {filteredAccounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <DollarSign className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhuma venda registrada ainda</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredAccounts.map((account) => (
            <Card key={account.id} data-testid={`card-sale-${account.id}`}>
              <CardContent className="py-4">
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="font-medium text-base">{account.name}</div>
                    {account.salesperson && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <User className="w-4 h-4" />
                        <span>Vendedor: {account.salesperson}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1">
                        <DollarSign className="w-4 h-4 text-green-600" />
                        <span className="font-medium">{account.planValue || "Não definido"}</span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        <span>{format(new Date(account.createdAt), "dd/MM/yyyy", { locale: ptBR })}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <Select
                      value={account.paymentStatus || "pending"}
                      onValueChange={(value) => handleStatusChange(account, value)}
                    >
                      <SelectTrigger className="w-[160px]" data-testid={`select-status-${account.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pendente</SelectItem>
                        <SelectItem value="paid">Cliente Pagou</SelectItem>
                        <SelectItem value="free">Plano Gratuito</SelectItem>
                      </SelectContent>
                    </Select>

                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`commission-${account.id}`}
                        checked={account.commissionPaid || false}
                        onCheckedChange={(checked) => handleCommissionChange(account, Boolean(checked))}
                        data-testid={`checkbox-commission-${account.id}`}
                      />
                      <label htmlFor={`commission-${account.id}`} className="text-sm cursor-pointer">
                        Comissão Paga
                      </label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
