import { NevadaLogo, Mountain } from "@/components/NevadaLogo";
import { Snowfall } from "@/components/Snowfall";
import { TicketForm } from "@/components/TicketForm";
import { formatEventDate } from "@/lib/format";
import { getStorefront } from "@/lib/storefront";

// Precios, cupos y estado de ventas cambian desde el admin: no cachear.
export const dynamic = "force-dynamic";

export default async function Home() {
  const sf = await getStorefront();

  return (
    <main className="relative flex min-h-dvh flex-col items-center px-4 pb-16 pt-8 sm:pt-14">
      <Snowfall />

      {sf.mode === "preview" && (
        <div
          role="status"
          className="relative z-10 mb-6 w-full max-w-md rounded-xl border border-ice/40 bg-deep/70 px-4 py-3 text-center text-[13px] text-frost backdrop-blur"
        >
          <strong className="font-bold">Vista previa:</strong> la base de datos todavía no está
          conectada. Precios y datos son de ejemplo y la compra está deshabilitada.
        </div>
      )}

      <section className="relative z-10 w-full max-w-md">
        {/* Encabezado del ticket */}
        <div className="overflow-hidden rounded-t-[28px] bg-gradient-to-b from-deep to-night px-6 pb-8 pt-9 text-center ring-1 ring-white/10">
          <div className="flex justify-center">
            <NevadaLogo height={118} />
          </div>
          {sf.mode === "live" || sf.mode === "preview" ? (
            <EventHeader event={sf.event} />
          ) : (
            <p className="mt-6 display text-2xl">NAVIDAD CON NEVADA 2026</p>
          )}
        </div>

        {/* Cuerpo blanco del ticket */}
        <div className="rounded-b-[28px] bg-white pb-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
          <div className="ticket-perforation" />
          <div className="px-5 pt-7 sm:px-7">
            <Body sf={sf} />
          </div>
        </div>

        <footer className="mt-8 flex flex-col items-center gap-2 text-center text-xs text-ice/80">
          <Mountain className="h-4 w-auto text-ice/70" />
          <p>Nevada Producciones · Oncativo, Córdoba</p>
          <p>Las entradas se envían por correo con un QR único por persona.</p>
        </footer>
      </section>
    </main>
  );
}

function EventHeader({
  event,
}: {
  event: { nombre: string; subtitulo: string | null; fechaInicio: string; lugar: string; ciudad: string };
}) {
  const f = formatEventDate(event.fechaInicio);
  return (
    <div className="mt-7">
      <h1 className="display text-[28px] leading-none sm:text-[32px]">{event.nombre.toUpperCase()}</h1>
      {event.subtitulo && (
        <p className="mt-3 text-[13px] font-semibold uppercase tracking-[0.22em] text-ice">
          {event.subtitulo}
        </p>
      )}
      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10 text-left">
        <div className="bg-night/60 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ice">Fecha</p>
          <p className="mt-1 text-sm font-semibold text-white">{f.dia}</p>
          <p className="text-xs text-frost/80">{f.hora} h</p>
        </div>
        <div className="bg-night/60 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ice">Lugar</p>
          <p className="mt-1 text-sm font-semibold text-white">{event.lugar}</p>
          <p className="text-xs text-frost/80">{event.ciudad}</p>
        </div>
      </div>
    </div>
  );
}

function Body({ sf }: { sf: Awaited<ReturnType<typeof getStorefront>> }) {
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

  return (
    <TicketForm
      tickets={sf.tickets}
      checkoutEnabled={false}
      disabledReason={
        sf.mode === "preview"
          ? "Compra deshabilitada en la vista previa."
          : "La compra online se habilita en cuanto se conecten los pagos."
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
