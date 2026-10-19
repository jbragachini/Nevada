import { EventHeader } from "@/components/EventHeader";
import { NevadaLogo } from "@/components/NevadaLogo";
import { TicketForm } from "@/components/TicketForm";
import { TicketShell } from "@/components/TicketShell";
import { getCheckout } from "@/lib/checkout";
import { getStorefront } from "@/lib/storefront";

// Precios, cupos y estado de ventas cambian desde el admin: no cachear.
export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ rrpp?: string }>;
}) {
  const sf = await getStorefront();
  const { rrpp } = await searchParams;

  return (
    <TicketShell
      aviso={
        sf.mode === "preview" && (
          <>
            <strong className="font-bold">Vista previa:</strong> la base de datos todavía no está
            conectada. Precios y datos son de ejemplo y la compra está deshabilitada.
          </>
        )
      }
      head={
        <>
          <div className="flex justify-center">
            <NevadaLogo height={118} />
          </div>
          {sf.mode === "live" || sf.mode === "preview" ? (
            <EventHeader event={sf.event} />
          ) : (
            <p className="mt-6 display text-2xl">NAVIDAD CON NEVADA 2026</p>
          )}
        </>
      }
      footer={<p>Las entradas se envían por correo con un QR único por persona.</p>}
    >
      <Body sf={sf} rrppCode={rrpp} />
    </TicketShell>
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

  return (
    <TicketForm
      eventId={sf.event.id}
      tickets={sf.tickets}
      rrpps={sf.rrpps}
      initialRrppId={initialRrppId}
      checkout={checkout?.habilitado ? checkout.modo : null}
      disabledReason={
        !checkout
          ? "Compra deshabilitada en la vista previa."
          : checkout.habilitado
            ? undefined
            : checkout.motivo
      }
    />
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-frost px-5 py-8 text-center">
      <p className="display text-xl text-deep">{title}</p>
      <p className="mt-2 text-sm text-muted">{children}</p>
    </div>
  );
}
