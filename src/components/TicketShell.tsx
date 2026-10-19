import { Mountain } from "@/components/NevadaLogo";
import { Snowfall } from "@/components/Snowfall";

/**
 * Marco común de las pantallas del comprador: fondo noche con nieve, tarjeta tipo ticket con
 * encabezado azul, perforación y cuerpo blanco.
 */
export function TicketShell({
  aviso,
  head,
  children,
  footer,
}: {
  aviso?: React.ReactNode;
  head: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center px-4 pb-16 pt-8 sm:pt-14">
      <Snowfall />

      {aviso && (
        <div
          role="status"
          className="relative z-10 mb-6 w-full max-w-md rounded-xl border border-ice/40 bg-deep/70 px-4 py-3 text-center text-[13px] text-frost backdrop-blur"
        >
          {aviso}
        </div>
      )}

      <section className="relative z-10 w-full max-w-md">
        <div className="overflow-hidden rounded-t-[28px] bg-gradient-to-b from-deep to-night px-6 pb-8 pt-9 text-center ring-1 ring-white/10">
          {head}
        </div>

        <div className="rounded-b-[28px] bg-white pb-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
          <div className="ticket-perforation" />
          <div className="px-5 pt-7 sm:px-7">{children}</div>
        </div>

        <footer className="mt-8 flex flex-col items-center gap-2 text-center text-xs text-ice/80">
          <Mountain className="h-4 w-auto text-ice/70" />
          <p>Nevada Producciones · Oncativo, Córdoba</p>
          {footer}
        </footer>
      </section>
    </main>
  );
}
