import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Shield, User as UserIcon, Users } from "lucide-react";

const ROLE_CONFIG = {
  admin: { label: "Administrador", icon: Shield, color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  coordenador: { label: "Coordenador", icon: Users, color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  assessor: { label: "Assessor", icon: UserIcon, color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
};

export default function UsersManagement() {
  const { toast } = useToast();
  const [selectedUser, setSelectedUser] = useState<Omit<User, "password"> | null>(null);
  const [newRole, setNewRole] = useState<string>("");

  const { data: users, isLoading } = useQuery<Omit<User, "password">[]>({
    queryKey: ["/api/users"],
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return await apiRequest("PATCH", `/api/users/${userId}`, { role });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      
      // If the current user's role was changed, update localStorage and force refresh
      const currentUser = JSON.parse(localStorage.getItem("auth_user") || "{}");
      if (currentUser.id === data.id) {
        localStorage.setItem("auth_user", JSON.stringify(data));
        toast({
          title: "Sua permissão foi alterada",
          description: "Recarregando a página para aplicar as mudanças...",
        });
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setSelectedUser(null);
        setNewRole("");
        toast({
          title: "Permissão atualizada",
          description: "O nível de acesso do usuário foi atualizado com sucesso.",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message || "Erro ao atualizar permissão",
      });
    },
  });

  const handleEditRole = (user: Omit<User, "password">) => {
    setSelectedUser(user);
    setNewRole(user.role);
  };

  const handleSaveRole = () => {
    if (selectedUser && newRole) {
      updateRoleMutation.mutate({ userId: selectedUser.id, role: newRole });
    }
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gerenciamento de Usuários</h1>
          <p className="text-muted-foreground mt-2">Gerencie permissões e acessos dos usuários</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm">
            <Shield className="w-3 h-3 mr-1" />
            Apenas Administradores
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          [...Array(6)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)
        ) : users && users.length > 0 ? (
          users.map((user) => {
            const roleConfig = ROLE_CONFIG[user.role as keyof typeof ROLE_CONFIG];
            const RoleIcon = roleConfig.icon;

            return (
              <Card key={user.id} className="hover-elevate" data-testid={`card-user-${user.id}`}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <UserIcon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{user.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge className={roleConfig.color}>
                      <RoleIcon className="w-3 h-3 mr-1" />
                      {roleConfig.label}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditRole(user)}
                      data-testid={`button-edit-role-${user.id}`}
                    >
                      Alterar Permissão
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Cadastrado em {new Date(user.createdAt).toLocaleDateString("pt-BR")}
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card className="col-span-full p-12 text-center">
            <UserIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhum usuário encontrado</p>
          </Card>
        )}
      </div>

      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent data-testid="dialog-edit-role">
          <DialogHeader>
            <DialogTitle>Alterar Nível de Acesso</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-1">Usuário</p>
                <p className="text-sm text-muted-foreground">{selectedUser.name} ({selectedUser.email})</p>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Novo Nível de Acesso</p>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger data-testid="select-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_CONFIG).map(([role, config]) => {
                      const Icon = config.icon;
                      return (
                        <SelectItem key={role} value={role}>
                          <div className="flex items-center gap-2">
                            <Icon className="w-4 h-4" />
                            {config.label}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="bg-muted/50 p-3 rounded-md text-sm">
                <p className="font-medium mb-2">Níveis de Acesso:</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• <strong>Administrador:</strong> Acesso total ao sistema</li>
                  <li>• <strong>Coordenador:</strong> Gerencia equipe e operações</li>
                  <li>• <strong>Assessor:</strong> Acesso básico às funcionalidades</li>
                </ul>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedUser(null)} data-testid="button-cancel">
              Cancelar
            </Button>
            <Button
              onClick={handleSaveRole}
              disabled={!newRole || updateRoleMutation.isPending}
              data-testid="button-save-role"
            >
              {updateRoleMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
