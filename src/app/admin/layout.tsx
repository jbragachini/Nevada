import type { Metadata } from "next";
import { AvisosProvider } from "@/components/admin/Avisos";
import { StaffShell } from "@/components/StaffShell";
import { requireAdmin } from "@/lib/sesion";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin · Nevada Producciones", robots: { index: false, follow: false } };

const LINKS = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/eventos", label: "Eventos" },
  { href: "/admin/aprobar", label: "Por aprobar" },
  { href: "/admin/ventas", label: "Ventas" },
  { href: "/admin/comisiones", label: "Comisiones" },
  { href: "/admin/rrpp", label: "RRPP" },
  { href: "/admin/invitados", label: "Invitados" },
  { href: "/admin/entradas", label: "Entradas" },
  { href: "/admin/auditoria", label: "Auditoría" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sesion = await requireAdmin();
  return (
    <StaffShell nombre={sesion.nombre} links={LINKS}>
      <AvisosProvider>{children}</AvisosProvider>
    </StaffShell>
  );
}
