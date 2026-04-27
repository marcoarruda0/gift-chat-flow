import {
  LayoutDashboard,
  Users,
  MessageSquare,
  GitBranch,
  Send,
  Gift,
  BookOpen,
  Settings,
  Shield,
  LogOut,
  Building2,
  ShoppingBag,
  ChevronsUpDown,
  BarChart3,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const mainItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Contatos", url: "/contatos", icon: Users },
  { title: "Conversas", url: "/conversas", icon: MessageSquare },
  { title: "Fluxos", url: "/fluxos", icon: GitBranch },
  { title: "Campanhas", url: "/campanhas", icon: Send },
  { title: "Giftback", url: "/giftback", icon: Gift },
  { title: "Base de Conhecimento", url: "/conhecimento", icon: BookOpen },
  { title: "Peça Rara", url: "/peca-rara", icon: ShoppingBag },
  { title: "Configurações", url: "/configuracoes", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { profile, hasRole, signOut, tenants, switchTenant } = useAuth();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const activeTenant = tenants.find((t) => t.id === profile?.tenant_id);
  const showTenantSwitcher = tenants.length > 1;

  return (
    <Sidebar collapsible="icon">
      {/* Tenant switcher */}
      <SidebarHeader>
        {showTenantSwitcher ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton className="w-full hover:bg-sidebar-accent">
                <Building2 className="h-5 w-5 text-sidebar-primary" />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left text-sm font-bold truncate">
                      {activeTenant?.nome || "Empresa"}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 text-sidebar-foreground/50" />
                  </>
                )}
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {tenants.map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  onClick={() => switchTenant(t.id)}
                  className={t.id === profile?.tenant_id ? "bg-accent" : ""}
                >
                  <Building2 className="h-4 w-4 mr-2" />
                  {t.nome}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex items-center gap-2 px-2 py-2">
            <MessageSquare className="h-5 w-5 text-sidebar-primary" />
            {!collapsed && <span className="font-bold text-base">CRM Bot</span>}
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {(hasRole("admin_tenant") || hasRole("admin_master")) && (
                <>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/relatorios")}>
                      <NavLink
                        to="/relatorios"
                        className="hover:bg-sidebar-accent"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                      >
                        <BarChart3 className="h-4 w-4" />
                        {!collapsed && <span>Relatórios</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/empresas")}>
                      <NavLink
                        to="/empresas"
                        className="hover:bg-sidebar-accent"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                      >
                        <Building2 className="h-4 w-4" />
                        {!collapsed && <span>Empresas</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </>
              )}
              {hasRole("admin_master") && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/admin")}>
                    <NavLink
                      to="/admin"
                      className="hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <Shield className="h-4 w-4" />
                      {!collapsed && <span>Admin Master</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} className="hover:bg-sidebar-accent">
              {!collapsed ? (
                <div className="flex items-center gap-2 w-full">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-xs bg-sidebar-primary text-sidebar-primary-foreground">
                      {profile?.nome?.charAt(0)?.toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 text-left text-xs truncate">
                    <p className="font-medium truncate">{profile?.nome || "Usuário"}</p>
                  </div>
                  <LogOut className="h-4 w-4 text-sidebar-foreground/50" />
                </div>
              ) : (
                <LogOut className="h-4 w-4" />
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
