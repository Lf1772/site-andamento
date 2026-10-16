"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { IconFolder, IconHome, IconMenu, IconPlus, IconScale, IconSettings, IconShield, IconUsers } from "./icons";

interface Props {
  user: { nome: string; papelLabel: string; escritorioNome: string; isAdmin: boolean };
}

export function Sidebar({ user }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const items = [
    { href: "/", label: "Painel", icon: IconHome, exact: true },
    { href: "/processos/novo", label: "Novo processo", icon: IconPlus, exact: true },
    { href: "/processos", label: "Processos", icon: IconFolder },
    ...(user.isAdmin
      ? [
          { href: "/usuarios", label: "Usuários", icon: IconUsers },
          { href: "/auditoria", label: "Auditoria", icon: IconShield },
          { href: "/configuracoes", label: "Configurações", icon: IconSettings },
        ]
      : []),
  ];

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || (pathname.startsWith(href + "/") && !pathname.startsWith("/processos/novo"));

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const nav = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white">
          <IconScale className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-serif text-[15px] font-semibold text-white">Andamento Processual</p>
          <p className="truncate text-xs text-navy-300">{user.escritorioNome}</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-2">
        {items.map((it) => {
          const active = isActive(it.href, it.exact);
          return (
            <Link
              key={it.href}
              href={it.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                active ? "bg-white/12 font-medium text-white" : "text-navy-200 hover:bg-white/6 hover:text-white"
              }`}
            >
              <it.icon className="h-[18px] w-[18px]" />
              {it.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 px-5 py-4">
        <p className="truncate text-sm font-medium text-white">{user.nome}</p>
        <p className="text-xs text-navy-300">{user.papelLabel}</p>
        <button onClick={logout} className="mt-3 text-xs font-medium text-navy-200 hover:text-white">
          Sair
        </button>
      </div>
    </div>
  );

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between bg-navy-900 px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2 text-white">
          <IconScale className="h-5 w-5" />
          <span className="font-serif font-semibold">Andamento Processual</span>
        </div>
        <button onClick={() => setOpen(true)} className="text-white" aria-label="Abrir menu">
          <IconMenu />
        </button>
      </header>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 bg-navy-900 lg:block">{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-navy-900 shadow-xl">{nav}</aside>
        </div>
      )}
    </>
  );
}
