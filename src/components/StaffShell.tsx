import { salir } from "@/app/actions/auth";
import { Mountain } from "@/components/NevadaLogo";
import { StaffNav } from "@/components/StaffNav";

/** Marco de los paneles del personal: barra superior con menú y salida, y contenido ancho. */
export function StaffShell({
  nombre,
  links,
  children,
}: {
  nombre: string;
  links: { href: string; label: string }[];
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh px-4 pb-16">
      <header className="sticky top-0 z-20 -mx-4 border-b border-ice/15 bg-night/92 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-x-5 gap-y-3">
          <div className="flex items-center gap-2.5 text-white">
            <Mountain className="h-auto w-11 text-ice" />
            <span className="display text-[15px] tracking-[0.02em]">NEVADA</span>
          </div>
          <StaffNav links={links} />
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-[13px] text-frost/80 sm:inline">{nombre}</span>
            <form action={salir}>
              <button
                type="submit"
                className="min-h-10 rounded-full border border-ice/30 px-4 text-[13px] font-semibold text-frost transition-colors hover:border-ice hover:text-white focus-visible:outline-2 focus-visible:outline-ice"
              >
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto mt-6 max-w-[1120px]">{children}</main>
    </div>
  );
}
