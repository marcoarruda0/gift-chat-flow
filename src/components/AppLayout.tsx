import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

interface AppLayoutProps {
  children: ReactNode;
  noPadding?: boolean;
}

export function AppLayout({ children, noPadding }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <div className="h-screen flex w-full overflow-hidden">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-h-0">
          <header className="h-12 flex-shrink-0 flex items-center border-b bg-background px-4">
            <SidebarTrigger />
          </header>
          <main className={`flex-1 min-h-0 ${noPadding ? "overflow-hidden" : "overflow-auto p-4 md:p-6"}`}>
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
