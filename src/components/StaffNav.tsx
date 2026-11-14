"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Secciones del panel. Va en su propia fila, debajo de la marca: en pantallas medianas y grandes
 * los botones bajan de línea para que se vean todos; en el celular se desliza de costado y la
 * sección actual queda a la vista.
 */
export function StaffNav({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  const nav = useRef<HTMLElement>(null);

  useEffect(() => {
    nav.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [path]);

  if (links.length < 2) return null;
  return (
    <nav
      ref={nav}
      aria-label="Secciones"
      className="order-last -mx-1 flex w-full min-w-0 gap-1.5 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] md:flex-wrap md:overflow-visible"
    >
      {links.map((l) => {
        const actual = path === l.href || (l.href !== "/admin" && l.href !== "/rrpp" && path.startsWith(`${l.href}/`));
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={actual ? "page" : undefined}
            className={`flex min-h-10 shrink-0 items-center rounded-full px-4 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-ice ${
              actual ? "bg-ice text-night" : "border border-ice/30 text-frost hover:border-ice hover:text-white"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
