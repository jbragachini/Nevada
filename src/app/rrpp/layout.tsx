import type { Metadata } from "next";
import { StaffShell } from "@/components/StaffShell";
import { requireRrpp } from "@/lib/sesion";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Panel RRPP · Nevada Producciones", robots: { index: false, follow: false } };

export default async function RrppLayout({ children }: { children: React.ReactNode }) {
  const sesion = await requireRrpp();

  // Hasta que el admin lo aprueba (perfil activo y ficha de vendedor), no ve nada más.
  if (!sesion.activo || !sesion.seller) {
    const rechazado = sesion.acceso === "rechazada";
    return (
      <StaffShell nombre={sesion.nombre} links={[]}>
        <section className="mx-auto mt-10 max-w-md rounded-[20px] bg-white p-6 text-center text-ink">
          <h1 className="display text-[22px] leading-tight text-deep">
            {rechazado ? "ACCESO NO APROBADO" : "TU ACCESO ESTÁ PENDIENTE"}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted text-pretty">
            {rechazado
              ? "Nevada no aprobó este usuario. Si creés que es un error, hablá con el admin."
              : "Recibimos tu pedido. Cuando Nevada lo apruebe vas a ver acá tus ventas, tu link y tus comisiones."}
          </p>
        </section>
      </StaffShell>
    );
  }

  return (
    <StaffShell
      nombre={sesion.nombre}
      links={[
        { href: "/rrpp", label: "Mi panel" },
        { href: "/rrpp/invitados", label: "Invitados" },
      ]}
    >
      {children}
    </StaffShell>
  );
}
