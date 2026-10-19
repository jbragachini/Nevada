import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { salir } from "@/app/actions/auth";
import { ActivarDobleVerificacion, PedirCodigo } from "@/components/DobleVerificacion";
import { NevadaLogo } from "@/components/NevadaLogo";
import { TicketShell } from "@/components/TicketShell";
import { getNivel, getSesion, inicioDe } from "@/lib/sesion";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Verificación · Nevada Producciones",
  robots: { index: false, follow: false },
};

export default async function VerificacionPage() {
  const sesion = await getSesion();
  if (!sesion) redirect("/ingresar");
  if (sesion.rol !== "admin") redirect(inicioDe(sesion));
  const nivel = await getNivel();
  if (nivel.actual === "aal2") redirect("/admin");
  const tieneApp = nivel.siguiente === "aal2";

  return (
    <TicketShell
      head={
        <>
          <div className="flex justify-center">
            <NevadaLogo height={72} />
          </div>
          <h1 className="mt-6 display text-2xl">{tieneApp ? "VERIFICACIÓN" : "DOBLE VERIFICACIÓN"}</h1>
          <p className="mt-2 text-[13px] text-frost/80">Hola, {sesion.nombre.split(" ")[0]}</p>
        </>
      }
    >
      {tieneApp ? <PedirCodigo /> : <ActivarDobleVerificacion />}
      <form action={salir} className="mt-5 text-center">
        <button type="submit" className="text-[13px] font-semibold text-muted underline underline-offset-4 hover:text-deep">
          Salir y entrar con otro usuario
        </button>
      </form>
    </TicketShell>
  );
}
