import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Users, UserCheck, Truck, Mail, Cake, VenetianMask } from "lucide-react";

function pct(num: number, den: number): number {
  if (!den) return 0;
  return Math.round((num / den) * 1000) / 10;
}

function PercentCard({
  title,
  icon: Icon,
  filled,
  total,
  loading,
}: {
  title: string;
  icon: React.ElementType;
  filled: number;
  total: number;
  loading?: boolean;
}) {
  const p = pct(filled, total);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <div className="text-3xl font-bold">{p.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              {filled} de {total} clientes
            </p>
            <Progress value={p} className="h-2" />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TotalCard({
  title,
  value,
  icon: Icon,
  loading,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <div className="text-2xl font-bold">{value}</div>
        )}
      </CardContent>
    </Card>
  );
}

export default function RelatorioCRM() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  const { data: contatos, isLoading } = useQuery({
    queryKey: ["relatorio-crm-contatos", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contatos")
        .select("id, genero, data_nascimento, email, campos_personalizados")
        .eq("tenant_id", tenantId!)
        .limit(10000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
  });

  const stats = useMemo(() => {
    const list = contatos || [];
    let totalClientes = 0;
    let totalFornecedores = 0;
    let comGenero = 0;
    let comNascimento = 0;
    let comEmail = 0;

    list.forEach((c: any) => {
      const cp = c.campos_personalizados || {};
      const isCliente = cp.cliente === true;
      const isFornecedor = cp.fornecedor === true;
      if (isFornecedor) totalFornecedores++;
      if (!isCliente) return;
      totalClientes++;
      if (c.genero && String(c.genero).trim() !== "") comGenero++;
      if (c.data_nascimento) comNascimento++;
      if (c.email && String(c.email).trim() !== "") comEmail++;
    });

    return {
      totalContatos: list.length,
      totalClientes,
      totalFornecedores,
      comGenero,
      comNascimento,
      comEmail,
    };
  }, [contatos]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">CRM — Qualidade da base</h2>
        <p className="text-sm text-muted-foreground">
          Indicadores de preenchimento dos contatos marcados como clientes
        </p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <TotalCard
          title="Total de contatos"
          value={stats.totalContatos}
          icon={Users}
          loading={isLoading}
        />
        <TotalCard
          title="Clientes"
          value={stats.totalClientes}
          icon={UserCheck}
          loading={isLoading}
        />
        <TotalCard
          title="Fornecedores"
          value={stats.totalFornecedores}
          icon={Truck}
          loading={isLoading}
        />
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <PercentCard
          title="Clientes com gênero"
          icon={VenetianMask}
          filled={stats.comGenero}
          total={stats.totalClientes}
          loading={isLoading}
        />
        <PercentCard
          title="Clientes com data de nascimento"
          icon={Cake}
          filled={stats.comNascimento}
          total={stats.totalClientes}
          loading={isLoading}
        />
        <PercentCard
          title="Clientes com email"
          icon={Mail}
          filled={stats.comEmail}
          total={stats.totalClientes}
          loading={isLoading}
        />
      </div>

      {!isLoading && stats.totalClientes === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhum contato marcado como cliente ainda. Marque o campo "Cliente"
            no cadastro de contatos para acompanhar a qualidade da base.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
