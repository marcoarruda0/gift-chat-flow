import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  tenant_id: string | null;
  nome: string | null;
  avatar_url: string | null;
  departamento: string | null;
  apelido: string | null;
  mostrar_apelido: boolean;
}

interface TenantInfo {
  id: string;
  nome: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: string[];
  tenants: TenantInfo[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, nome: string, empresa?: string) => Promise<void>;
  signOut: () => Promise<void>;
  hasRole: (role: string) => boolean;
  switchTenant: (tenantId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    setProfile(data);
  };

  const fetchRoles = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    setRoles(data?.map((r) => r.role) || []);
  };

  const fetchTenants = async (userId: string) => {
    const { data: userTenants } = await supabase
      .from("user_tenants")
      .select("tenant_id")
      .eq("user_id", userId);

    if (userTenants && userTenants.length > 0) {
      const tenantIds = userTenants.map((ut: any) => ut.tenant_id);
      const { data: tenantData } = await supabase
        .from("tenants")
        .select("id, nome")
        .in("id", tenantIds);
      setTenants(tenantData || []);
    } else {
      setTenants([]);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id);
            fetchRoles(session.user.id);
            fetchTenants(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setRoles([]);
          setTenants([]);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
        fetchRoles(session.user.id);
        fetchTenants(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, nome: string, empresa?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nome, empresa } },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const hasRole = (role: string) => roles.includes(role);

  const switchTenant = async (tenantId: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ tenant_id: tenantId } as any)
      .eq("id", user.id);
    if (!error) {
      await fetchProfile(user.id);
      await fetchRoles(user.id);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, session, profile, roles, tenants, loading, signIn, signUp, signOut, hasRole, switchTenant }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
