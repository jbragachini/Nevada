import type { Metadata } from "next";
import { StaffShell } from "@/components/StaffShell";
import { requireAdmin } from "@/lib/sesion";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin · Nevada Producciones", robots: { index: false, follow: false } };

export default async function AdminPage() {
  const sesion = await requireAdmin();
  return (
    <StaffShell nombre={sesion.nombre} links={[{ href: "/admin", label: "Inicio" }]}>
      <h1 className="display text-[clamp(22px,4vw,30px)] text-white">Hola, {sesion.nombre.split(" ")[0]}</h1>
      <section className="mt-5 max-w-xl rounded-[20px] bg-white p-5 text-ink">
        <h2 className="display text-[19px] text-deep">Panel del admin</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Eventos, aprobaciones, ventas por vendedor, comisiones, rendiciones, accesos de RRPP y la Puerta
          llegan en la etapa 4. Mientras tanto, esos cambios se hacen desde el SQL Editor de Supabase (pasos en
          el README).
        </p>
      </section>
    </StaffShell>
  );
}
