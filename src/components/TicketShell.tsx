import { Mountain } from "@/components/NevadaLogo";
import { Snowfall } from "@/components/Snowfall";

/**
 * Marco común de las pantallas del comprador, con el estilo de la portada: el camino a la
 * montaña de fondo, nieve y una tarjeta de vidrio con el encabezado del evento arriba.
 */
export function TicketShell({
  id,
  aviso,
  head,
  children,
  footer,
}: {
  /** Ancla para bajar desde la portada (recibe el foco al llegar). */
  id?: string;
  aviso?: React.ReactNode;
  head: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main
      id={id}
      tabIndex={id ? -1 : undefined}
      className="relative flex min-h-dvh flex-col items-center px-4 pb-16 pt-8 outline-none sm:pt-14"
    >
      <div className="fondo-noche" aria-hidden="true" />
      <Snowfall />

      {aviso && (
        <div
          role="status"
          className="relative z-10 mb-6 w-full max-w-md rounded-xl border border-ice/40 bg-deep/70 px-4 py-3 text-center text-[13px] text-frost backdrop-blur"
        >
          {aviso}
        </div>
      )}

      <section className="tema-noche relative z-10 w-full max-w-md">
        <div className="vidrio overflow-hidden rounded-[28px]">
          <div className="px-6 pb-7 pt-9 text-center">{head}</div>
          <div className="mx-6 h-px bg-white/12" />
          <div className="px-5 pb-6 pt-7 sm:px-7">{children}</div>
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
