import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, ArrowLeft } from "lucide-react";

type Mode = "signin" | "signup" | "forgot";

function translateAuthError(message: string): string {
  const m = (message || "").toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (m.includes("user already registered")) return "Este e-mail já está cadastrado. Tente entrar.";
  if (m.includes("rate limit")) return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  if (m.includes("password") && m.includes("short")) return "A senha precisa ter no mínimo 6 caracteres.";
  if (m.includes("network")) return "Falha de conexão. Verifique sua internet.";
  return message || "Não foi possível concluir a operação. Tente novamente.";
}

export default function Login() {
  const [searchParams] = useSearchParams();
  const conviteToken = searchParams.get("convite");
  const [mode, setMode] = useState<Mode>(conviteToken ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<{ email: string; tenant_nome: string } | null>(null);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!conviteToken) return;
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
      if (mode === "signup") {
        await signUp(email, password, nome, empresa);
        toast({ title: "Conta criada!", description: "Você já pode entrar." });
        // Como auto-confirm está ativo, o signUp já loga. Caso não logue, manda p/ login.
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) setMode("signin");
      } else if (mode === "signin") {
        await signIn(email, password);
        navigate("/");
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast({
          title: "Verifique seu e-mail",
          description: "Se este e-mail estiver cadastrado, você receberá instruções em instantes.",
        });
        setMode("signin");
      }
    } catch (error: any) {
      toast({ title: "Erro", description: translateAuthError(error.message), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const titleMap: Record<Mode, string> = {
    signin: "Entrar",
    signup: "Criar Conta",
    forgot: "Recuperar acesso",
  };
  const descMap: Record<Mode, string> = {
    signin: "Entre com suas credenciais para acessar a plataforma",
    signup: inviteInfo
      ? `Você foi convidado para ${inviteInfo.tenant_nome}. Crie sua conta para entrar.`
      : "Preencha os dados para criar sua conta",
    forgot: "Informe seu e-mail e enviaremos um link para você redefinir a senha",
  };
  const submitLabel: Record<Mode, string> = {
    signin: "Entrar",
    signup: "Criar Conta",
    forgot: "Enviar instruções",
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
          <CardTitle className="text-2xl">{titleMap[mode]}</CardTitle>
          <CardDescription>{descMap[mode]}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome</Label>
                  <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome completo" required />
                </div>
                {!inviteInfo && (
                  <div className="space-y-2">
                    <Label htmlFor="empresa">Nome da Empresa</Label>
                    <Input id="empresa" value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Sua empresa ou loja" />
                  </div>
                )}
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com" required
                disabled={!!inviteInfo && mode === "signup"}
              />
            </div>
            {mode !== "forgot" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Senha</Label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="text-xs text-primary hover:underline"
                    >
                      Esqueci minha senha
                    </button>
                  )}
                </div>
                <Input
                  id="password" type="password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" required minLength={6}
                />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Carregando..." : submitLabel[mode]}
            </Button>
          </form>

          <div className="mt-4 text-center text-sm text-muted-foreground">
            {mode === "forgot" ? (
              <button
                type="button"
                onClick={() => setMode("signin")}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <ArrowLeft className="h-3 w-3" /> Voltar para o login
              </button>
            ) : mode === "signup" ? (
              <>
                Já tem uma conta?{" "}
                <button type="button" onClick={() => setMode("signin")} className="text-primary underline-offset-4 hover:underline">
                  Entrar
                </button>
              </>
            ) : (
              <>
                Não tem uma conta?{" "}
                <button type="button" onClick={() => setMode("signup")} className="text-primary underline-offset-4 hover:underline">
                  Criar conta
                </button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
