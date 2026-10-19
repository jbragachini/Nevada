import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { IngresoForms } from "@/components/IngresoForms";
import { NevadaLogo } from "@/components/NevadaLogo";
import { TicketShell } from "@/components/TicketShell";
import { getSesion, inicioDe } from "@/lib/sesion";

export const dynamic = "force-dynamic";

// Sin link desde la página pública y fuera de los buscadores.
export const metadata: Metadata = {
  title: "Ingreso · Nevada Producciones",
  robots: { index: false, follow: false },
};

export default async function IngresarPage() {
  const sesion = await getSesion();
  if (sesion) redirect(inicioDe(sesion));

  return (
    <TicketShell
      head={
        <>
          <div className="flex justify-center">
            <NevadaLogo height={72} />
          </div>
          <h1 className="mt-6 display text-2xl">INGRESO</h1>
          <p className="mt-2 text-[13px] text-frost/80">RRPP y administración</p>
        </>
      }
    >
      <IngresoForms />
    </TicketShell>
  );
}
