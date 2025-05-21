"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MessageSquare, Users, Settings, SunMoon, UserCircle2, LogOut, GripVertical } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const NavItem = ({ href, icon: Icon, label, isMobile }: { href: string; icon: React.ElementType; label: string; isMobile: boolean }) => {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== "/chats" && pathname.startsWith(href));
  const { state } = useSidebar();
  
  const content = (
    <>
      <Icon className={cn("h-5 w-5", isActive ? "text-primary-foreground" : "text-sidebar-foreground group-hover:text-sidebar-accent-foreground")} />
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
          <Link href={href} passHref>
            <Button
              variant={isActive ? "default" : "ghost"}
              className={cn(
                "w-full justify-start gap-2",
                isActive ? "bg-primary text-primary-foreground hover:bg-primary/90" : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                state === "collapsed" && !isMobile ? "px-2" : ""
              )}
              aria-current={isActive ? "page" : undefined}
            >
              {content}
            </Button>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link href={href} passHref>
      <Button
        variant={isActive ? "default" : "ghost"}
        className={cn(
          "w-full justify-start gap-2",
          isActive ? "bg-primary text-primary-foreground hover:bg-primary/90" : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          state === "collapsed" && !isMobile ? "px-2" : ""
        )}
        aria-current={isActive ? "page" : undefined}
      >
        {content}
      </Button>
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
    { href: "/status", icon: Users, label: "Status" },
    { href: "/profile", icon: UserCircle2, label: "Profile" },
  ];

  return (
    <Sidebar className="border-r" collapsible="icon">
      <SidebarHeader className="p-4 flex justify-between items-center">
        <Logo className={cn(isMobile ? "" : "group-data-[collapsible=icon]:hidden")}/>
        <div className={cn(isMobile ? "hidden" : "group-data-[collapsible=icon]:hidden")}>
          <SidebarTrigger />
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
      <SidebarFooter className="p-2 border-t">
        {isMobile ? (
             user && (
              <Button variant="ghost" onClick={handleLogout} className="w-full justify-start gap-2">
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
                <Button variant="ghost" size="icon" onClick={handleLogout} className="w-full">
                  <LogOut className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Logout</p>
              </TooltipContent>
            </Tooltip>
          )
        }
      </SidebarFooter>
    </Sidebar>
  );
}
