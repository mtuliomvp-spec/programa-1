"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "@/lib/clsx";
import { navGroupsFor, isNavActive } from "@/lib/nav";
import BrandMark from "@/components/BrandMark";
import UserFooter from "@/components/UserFooter";

type SessionUser = {
  name: string;
  role: "ADMIN" | "OPERADOR";
  permissions: string[];
  roleLabel?: string;
};
type Brand = { name: string; logoDataUrl: string | null };

export default function MobileNav({ user, brand }: { user: SessionUser; brand?: Brand }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const groups = navGroupsFor(user);

  // fecha a gaveta ao navegar
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:hidden">
        <BrandMark name={brand?.name} logoDataUrl={brand?.logoDataUrl} />
        <button
          type="button"
          aria-label="Abrir menu"
          onClick={() => setOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
        </button>
      </header>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 flex w-[85%] max-w-xs flex-col bg-slate-950 shadow-2xl">
            <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
              <BrandMark dark name={brand?.name} logoDataUrl={brand?.logoDataUrl} />
              <button
                type="button"
                aria-label="Fechar menu"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
              {groups.map((group) => (
                <div key={group.title}>
                  <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {group.title}
                  </p>
                  <div className="mt-1.5 space-y-0.5">
                    {group.items.map((item) => {
                      const active = isNavActive(item.href, pathname);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={clsx(
                            "flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium",
                            active
                              ? "bg-blue-600 text-white"
                              : "text-slate-300 hover:bg-white/10 hover:text-white",
                          )}
                        >
                          <span aria-hidden>{item.icon}</span>
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
            <div className="border-t border-white/10 px-4 py-3">
              <UserFooter user={user} roleLabel={user.roleLabel} dark />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
