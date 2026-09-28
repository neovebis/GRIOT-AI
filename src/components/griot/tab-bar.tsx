import { Link, useRouterState } from "@tanstack/react-router";
import { Home, MessageCircle, FolderOpen, Camera, SlidersHorizontal } from "lucide-react";
import { useT } from "@/lib/i18n";

const TABS = [
  { to: "/home", label: "Home", Icon: Home },
  { to: "/chat", label: "Chat", Icon: MessageCircle },
  { to: "/projects", label: "Projects", Icon: FolderOpen },
  { to: "/capture", label: "Capture", Icon: Camera },
  { to: "/control", label: "Control", Icon: SlidersHorizontal },
] as const;

export function TabBar() {
  const t = useT();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  // Dentro do chat a barra desaparece — o ecrã é só a conversa.
  if (pathname === "/chat" || pathname.startsWith("/chat/")) return null;

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
      <div className="mx-auto w-full max-w-lg px-3 pb-[calc(env(safe-area-inset-bottom,0px)+10px)]">
        <div className="pointer-events-auto flex items-center justify-between gap-1 rounded-[26px] border border-hairline bg-surface/80 p-1.5 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)] backdrop-blur-2xl">
          {TABS.map(({ to, label, Icon }) => {
            const active = pathname === to || pathname.startsWith(`${to}/`);
            return (
              <Link
                key={to}
                to={to}
                className={`relative flex flex-1 flex-col items-center gap-1 rounded-[20px] px-1 py-2 transition-all duration-300 ${
                  active ? "bg-secondary" : "opacity-45 active:opacity-80"
                }`}
                style={{ transitionTimingFunction: "cubic-bezier(0.32,0.72,0,1)" }}
              >
                <Icon className="size-[21px]" strokeWidth={active ? 2.2 : 1.7} />
                <span className="text-[10px] leading-none font-medium tracking-tight">
                  {t(label)}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
