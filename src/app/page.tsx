import { ClaveCompartida } from "@/components/ClaveCompartida";
import { ClaveGate } from "@/components/ClaveGate";
import { EventHeader } from "@/components/EventHeader";
import { InvitacionGate } from "@/components/InvitacionGate";
import { NevadaLogo } from "@/components/NevadaLogo";
import { BotonComprar } from "@/components/portada/BotonComprar";
import { Portada } from "@/components/portada/Portada";
import { TicketForm } from "@/components/TicketForm";
import { TicketShell } from "@/components/TicketShell";
import { getCheckout } from "@/lib/checkout";
import { formatDiaPortada } from "@/lib/format";
import { getStorefront, type Portada as VariantePortada } from "@/lib/storefront";

// Precios, cupos y estado de ventas cambian desde el admin: no cachear.
export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ rrpp?: string; portada?: string }>;
}) {
  const sf = await getStorefront();
  const { rrpp, portada } = await searchParams;
  const conEvento = sf.mode === "live" || sf.mode === "preview";

  // La portada la elige el admin; ?portada=a|c deja ver la otra sin cambiarla.
  const variante: VariantePortada =
    portada === "a" || portada === "c" ? portada : conEvento ? sf.event.portada : "a";
  const linea = conEvento
    ? [
        sf.event.nombre.replace(/\s+20\d\d$/, ""),
        formatDiaPortada(sf.event.fechaInicio),
        sf.event.ciudad.split(",")[0],
      ].join(" · ")
    : "Navidad con Nevada 2026";
  const abiertas = conEvento && sf.event.ventasAbiertas;

  return (
    <ClaveCompartida>
      <Portada
        variante={variante}
        linea={linea}
        boton={
          <BotonComprar
            eventId={conEvento ? sf.event.id : ""}
            pideClave={abiertas && sf.event.acceso === "clave" && sf.mode === "live"}
            texto={abiertas ? "Comprar" : "Ver más"}
          />
        }
      />
      <TicketShell
        id="comprar"
        aviso={
          sf.mode === "preview" && (
            <>
              <strong className="font-bold">Vista previa:</strong> la base de datos todavía no está
              conectada. Precios y datos son de ejemplo y la compra está deshabilitada.
            </>
          )
        }
        head={
          conEvento ? (
            <EventHeader event={sf.event} />
          ) : (
            <>
              <div className="flex justify-center">
                <NevadaLogo height={96} />
              </div>
              <p className="mt-6 display text-2xl">NAVIDAD CON NEVADA 2026</p>
            </>
          )
        }
        footer={<p>Las entradas se envían por correo con un QR único por persona.</p>}
      >
        <Body sf={sf} rrppCode={rrpp} />
      </TicketShell>
    </ClaveCompartida>
  );
}

function Body({
  sf,
  rrppCode,
}: {
  sf: Awaited<ReturnType<typeof getStorefront>>;
  rrppCode?: string;
}) {
  if (sf.mode === "error") {
    return (
      <Notice title="NO PUDIMOS CARGAR EL EVENTO">
        Probá de nuevo en unos minutos. Si el problema sigue, escribinos por Instagram.
      </Notice>
    );
  }
  if (sf.mode === "no-event") {
    return (
      <Notice title="PRÓXIMAMENTE">Todavía no hay un evento publicado. Seguinos para enterarte.</Notice>
    );
  }
  if (!sf.event.ventasAbiertas) {
    return (
      <Notice title="VENTAS CERRADAS">
        La venta de entradas no está habilitada en este momento.
      </Notice>
    );
  }

  const initialRrppId = rrppCode
    ? sf.rrpps.find((r) => r.codigo === rrppCode.toLowerCase())?.id
    : undefined;

  const checkout = sf.mode === "live" ? getCheckout() : null;
  const formProps = {
    eventId: sf.event.id,
    tickets: sf.tickets,
    rrpps: sf.rrpps,
    initialRrppId,
    mostrarRrpp: sf.event.mostrarRrpp,
    checkout: checkout?.habilitado ? checkout.modo : null,
    disabledReason: !checkout
      ? "Compra deshabilitada en la vista previa."
      : checkout.habilitado
        ? undefined
        : checkout.motivo,
  };

  if (sf.event.acceso === "lista") return <InvitacionGate {...formProps} />;
  if (sf.event.acceso === "clave") return <ClaveGate {...formProps} />;
  return <TicketForm {...formProps} />;
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-frost px-5 py-8 text-center">
      <p className="display text-xl text-deep">{title}</p>
      <p className="mt-2 text-sm text-muted">{children}</p>
    </div>
  );
}
