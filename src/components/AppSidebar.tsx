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
  Bot,
  Building2,
  ShoppingBag,
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
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const mainItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Contatos", url: "/contatos", icon: Users },
  { title: "Conversas", url: "/conversas", icon: MessageSquare },
  { title: "Fluxos", url: "/fluxos", icon: GitBranch },
  { title: "Disparos", url: "/disparos", icon: Send },
  { title: "Giftback", url: "/giftback", icon: Gift },
  { title: "Base de Conhecimento", url: "/conhecimento", icon: BookOpen },
  { title: "Empresa", url: "/empresa", icon: Building2 },
  { title: "Peça Rara", url: "/peca-rara", icon: ShoppingBag },
  { title: "Configurações", url: "/configuracoes", icon: Settings },
  { title: "Config. IA", url: "/configuracoes/ia", icon: Bot },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { profile, hasRole, signOut } = useAuth();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/70">
            {!collapsed && (
              <div className="flex items-center gap-2 px-1 py-2">
                <MessageSquare className="h-5 w-5 text-sidebar-primary" />
                <span className="font-bold text-base">CRM Bot</span>
              </div>
            )}
          </SidebarGroupLabel>
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
