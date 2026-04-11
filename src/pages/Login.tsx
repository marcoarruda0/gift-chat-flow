import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare } from "lucide-react";

export default function Login() {
  const [searchParams] = useSearchParams();
  const conviteToken = searchParams.get("convite");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(!!conviteToken);
  const [nome, setNome] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<{ email: string; tenant_nome: string } | null>(null);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!conviteToken) return;
    // Fetch invite info to pre-fill email
    supabase
      .from("convites" as any)
      .select("email, tenants(nome)")
      .eq("token", conviteToken)
      .eq("status", "pendente")
      .single()
      .then(({ data }: any) => {
        if (data) {
          setInviteInfo({ email: data.email, tenant_nome: data.tenants?.nome || "" });
          setEmail(data.email);
        }
      });
  }, [conviteToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (isSignUp) {
        await signUp(email, password, nome, empresa);
        toast({ title: "Conta criada!", description: "Verifique seu email para confirmar." });
      } else {
        await signIn(email, password);
        navigate("/");
      }
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
              <MessageSquare className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl">
            {isSignUp ? "Criar Conta" : "Entrar"}
          </CardTitle>
          <CardDescription>
            {isSignUp
              ? "Preencha os dados para criar sua conta"
              : "Entre com suas credenciais para acessar a plataforma"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome</Label>
                  <Input
                    id="nome"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Seu nome completo"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="empresa">Nome da Empresa</Label>
                  <Input
                    id="empresa"
                    value={empresa}
                    onChange={(e) => setEmpresa(e.target.value)}
                    placeholder="Sua empresa ou loja"
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Carregando..." : isSignUp ? "Criar Conta" : "Entrar"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            {isSignUp ? "Já tem uma conta?" : "Não tem uma conta?"}{" "}
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-primary underline-offset-4 hover:underline"
            >
              {isSignUp ? "Entrar" : "Criar conta"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
