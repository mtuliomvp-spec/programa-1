"use client";

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

export default function Sidebar({ user, brand }: { user: SessionUser; brand?: Brand }) {
  const pathname = usePathname();
  const groups = navGroupsFor(user);

  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-slate-950 md:flex">
      <div className="flex h-16 items-center border-b border-white/10 px-5">
        <BrandMark dark name={brand?.name} logoDataUrl={brand?.logoDataUrl} />
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
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
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-blue-600 text-white shadow-sm"
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
    </aside>
  );
}
