import { ClaveCompartida } from "@/components/ClaveCompartida";
import { ClaveGate } from "@/components/ClaveGate";
import { EventHeader } from "@/components/EventHeader";
import { InvitacionGate } from "@/components/InvitacionGate";
import { NevadaLogo } from "@/components/NevadaLogo";
import { BotonComprar } from "@/components/portada/BotonComprar";
import { Portada } from "@/components/portada/Portada";
import { TicketForm } from "@/components/TicketForm";
import { TicketShell } from "@/components/TicketShell";
import type { Metadata } from "next";
import { PedidoGuardado } from "@/components/sitio/PedidoGuardado";
import { getCheckout } from "@/lib/checkout";
import { mailConfigurado } from "@/lib/contacto";
import { formatDiaPortada, formatEventDate } from "@/lib/format";
import { getStorefront, type Portada as VariantePortada } from "@/lib/storefront";

// Precios, cupos y estado de ventas cambian desde el admin: no cachear.
export const dynamic = "force-dynamic";

/** Título y vista previa al compartir el link (WhatsApp, Instagram): salen del evento publicado. */
export async function generateMetadata(): Promise<Metadata> {
  const sf = await getStorefront();
  if (sf.mode !== "live") return {};
  const f = formatEventDate(sf.event.fechaInicio);
  const title = `${sf.event.nombre} · Entradas`;
  const description = `${f.dia}, ${f.hora} h · ${sf.event.lugar}, ${sf.event.ciudad}. Comprá tus entradas online — Nevada Producciones.`;
  // Next no mezcla openGraph con el del layout: la imagen y el sitio se repiten acá.
  const imagen = { url: "/portadas/a-escritorio.jpg", width: 1920, height: 1200, alt: sf.event.nombre };
  return {
    title,
    description,
    openGraph: { type: "website", locale: "es_AR", siteName: "Nevada Producciones", title, description, images: [imagen] },
    twitter: { card: "summary_large_image", title, description, images: [imagen.url] },
  };
}

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
        footer={
          <p>
            {mailConfigurado()
              ? "Cuando aprobamos el pago te mandamos las entradas por mail, con un QR único por persona."
              : "Cuando aprobamos el pago, tus entradas aparecen en el link de tu pedido, con un QR único por persona."}
          </p>
        }
      >
        <PedidoGuardado />
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
        Probá de nuevo en unos minutos.
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
