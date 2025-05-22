
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MessageSquare, Users, Settings, SunMoon, UserCircle2, LogOut, GripVertical, Info } from "lucide-react"; // Added Info
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/icons/Logo";
import { UserNav } from "./UserNav";
import { useAuth } from "@/hooks/useAuth";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"; // Ensure TooltipProvider is imported if not already global

const NavItem = ({ href, icon: Icon, label, isMobile }: { href: string; icon: React.ElementType; label: string; isMobile: boolean }) => {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== "/chats" && pathname.startsWith(href)); // More robust active check
  const { state } = useSidebar();

  const commonButtonClasses = "w-full justify-start gap-3 text-sm px-3 py-2.5"; // Standardized padding and gap
  const activeClasses = "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90";
  const inactiveClasses = "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

  const content = (
    <>
      <Icon className={cn("h-5 w-5 shrink-0")} /> {/* Removed conditional color, rely on parent state */}
      <span className={cn(
          "truncate",
          state === "collapsed" && !isMobile ? "hidden" : "inline"
        )}
      >
        {label}
      </span>
    </>
  );

  if (state === 'collapsed' && !isMobile) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href={href} passHref legacyBehavior>
            <a
              className={cn(
                "flex items-center rounded-md",
                commonButtonClasses,
                isActive ? activeClasses : inactiveClasses,
                "px-2.5" // Specific padding for collapsed icon-only
              )}
              aria-current={isActive ? "page" : undefined}
            >
              {content}
            </a>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" className="bg-card text-card-foreground">
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link href={href} passHref legacyBehavior>
      <a
        className={cn(
          "flex items-center rounded-md",
          commonButtonClasses,
          isActive ? activeClasses : inactiveClasses
        )}
        aria-current={isActive ? "page" : undefined}
      >
        {content}
      </a>
    </Link>
  );
};


export function AppSidebar() {
  const { isMobile } = useSidebar();
  const router = useRouter();
  const { user } = useAuth();

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/auth/login");
  };


  const navItems = [
    { href: "/chats", icon: MessageSquare, label: "Chats" },
    { href: "/status", icon: Info, label: "Status" }, // Using Info as a placeholder for Status like WhatsApp
    { href: "/profile", icon: UserCircle2, label: "Profile" },
  ];

  return (
    // TooltipProvider should wrap components using Tooltip if not globally provided
    // If AppSidebar is the only place, it's fine here. Otherwise, move to a higher layout.
    <TooltipProvider delayDuration={0}>
      <Sidebar className="border-r bg-sidebar text-sidebar-foreground" collapsible="icon">
        <SidebarHeader className="p-4 flex justify-between items-center border-b border-sidebar-border">
          <Logo className={cn("h-7 fill-current text-sidebar-primary-foreground", isMobile ? "" : "group-data-[collapsible=icon]:hidden")}/>
          <div className={cn(isMobile ? "hidden" : "group-data-[collapsible=icon]:hidden")}>
            <SidebarTrigger className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
          </div>
        </SidebarHeader>
        <SidebarContent className="p-2">
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                 <NavItem href={item.href} icon={item.icon} label={item.label} isMobile={isMobile} />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="p-2 border-t border-sidebar-border">
          {isMobile ? (
               user && (
                <Button variant="ghost" onClick={handleLogout} className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
                  <LogOut className="h-5 w-5" />
                  <span>Logout</span>
                </Button>
              )
          ) : (
            <div className={cn("group-data-[collapsible=icon]:hidden")}>
              <UserNav />
            </div>
          )}
          {
            !isMobile && useSidebar().state === 'collapsed' && user && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={handleLogout} className="w-full text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
                    <LogOut className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-card text-card-foreground">
                  <p>Logout</p>
                </TooltipContent>
              </Tooltip>
            )
          }
        </SidebarFooter>
      </Sidebar>
    </TooltipProvider>
  );
}

    