"use client";

import * as React from "react";
import { Drawer } from "@heroui/react";

import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const SIDEBAR_COOKIE_NAME = "chat_sidebar_state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = "15.5rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

type ChatSidebarContextValue = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean | ((open: boolean) => boolean)) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

const ChatSidebarContext = React.createContext<ChatSidebarContextValue | null>(null);

export function useChatSidebar() {
  const context = React.useContext(ChatSidebarContext);

  if (!context) {
    throw new Error("useChatSidebar must be used within ChatSidebarProvider.");
  }

  return context;
}

export function ChatSidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const open = openProp ?? internalOpen;

  const setOpen = React.useCallback(
    (value: boolean | ((open: boolean) => boolean)) => {
      const nextOpen = typeof value === "function" ? value(open) : value;

      if (onOpenChange) {
        onOpenChange(nextOpen);
      } else {
        setInternalOpen(nextOpen);
      }

      document.cookie = `${SIDEBAR_COOKIE_NAME}=${nextOpen}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
    },
    [onOpenChange, open],
  );

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile((current) => !current);
      return;
    }

    setOpen((current) => !current);
  }, [isMobile, setOpen]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  const state = open ? "expanded" : "collapsed";
  const value = React.useMemo<ChatSidebarContextValue>(
    () => ({
      state,
      open,
      setOpen,
      openMobile,
      setOpenMobile,
      isMobile,
      toggleSidebar,
    }),
    [isMobile, open, openMobile, setOpen, state, toggleSidebar],
  );

  return (
    <ChatSidebarContext.Provider value={value}>
      <div
        className={cn("flex h-full min-h-0 w-full", className)}
        data-chat-sidebar-state={state}
        style={
          {
            "--chat-sidebar-width": SIDEBAR_WIDTH,
            ...style,
          } as React.CSSProperties
        }
        {...props}
      >
        {children}
      </div>
    </ChatSidebarContext.Provider>
  );
}

export function ChatSidebar({ children }: { children: React.ReactNode }) {
  const { isMobile, open, openMobile, setOpenMobile } = useChatSidebar();

  if (isMobile) {
    return (
      <Drawer isOpen={openMobile} onOpenChange={setOpenMobile}>
        <Drawer.Backdrop variant="blur">
          <Drawer.Content className="w-[min(18rem,calc(100vw-1rem))]" placement="left">
            <Drawer.Dialog className="h-full min-h-0 outline-hidden">
              <Drawer.Header className="sr-only">
                <Drawer.Heading>Chat Sidebar</Drawer.Heading>
              </Drawer.Header>
              <Drawer.Body className="h-full min-h-0 p-0">{children}</Drawer.Body>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer>
    );
  }

  return (
    <aside
      aria-label="Chat sidebar"
      className={cn(
        "h-full min-h-0 shrink-0 overflow-hidden transition-[width] duration-150 ease-out",
        open ? "w-(--chat-sidebar-width)" : "w-0",
      )}
    >
      <div className="h-full w-(--chat-sidebar-width) pb-1.5">{children}</div>
    </aside>
  );
}

export function ChatSidebarPanel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex h-full min-h-0 w-full flex-col overflow-hidden", className)}>
      {children}
    </div>
  );
}

export function ChatSidebarBlock({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <section className={cn("flex min-h-0 flex-1 flex-col", className)}>{children}</section>;
}

export function ChatSidebarBlockHeader({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("shrink-0 p-1.5", className)}>{children}</div>;
}

export function ChatSidebarBlockContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain", className)}>
      {children}
    </div>
  );
}
