/** Piezas comunes del panel del admin, con la misma estética que el panel del RRPP. */

export const boton = {
  primario:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ice px-5 text-sm font-bold text-night transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ice disabled:cursor-progress disabled:opacity-70",
  secundario:
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-line px-4 text-[13px] font-semibold text-muted transition-colors hover:border-ice hover:text-white focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-60",
  peligro:
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 text-[13px] font-semibold text-danger transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-danger disabled:opacity-60",
  oscuro:
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-ice/30 px-4 text-[13px] font-semibold text-frost transition-colors hover:border-ice hover:text-white focus-visible:outline-2 focus-visible:outline-ice disabled:opacity-60",
  claro:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ice px-5 text-sm font-bold text-night transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ice",
  ok: "inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-ok px-4 text-[13px] font-bold text-white transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ok disabled:cursor-progress disabled:opacity-70",
};

export const campo =
  "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[15px] text-ink placeholder:text-[#66788e] outline-none transition focus:border-blue focus:ring-4 focus:ring-ice/40 aria-[invalid=true]:border-danger";

export const etiqueta = "text-[13px] font-semibold text-ink";

export function Titulo({ children, extra }: { children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <h1 className="display text-[clamp(22px,4vw,30px)] leading-tight text-white">{children}</h1>
      {extra}
    </div>
  );
}

export function Card({
  titulo,
  acciones,
  children,
  className = "",
  id,
}: {
  titulo?: React.ReactNode;
  acciones?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      aria-labelledby={titulo && id ? `${id}-titulo` : undefined}
      className={`min-w-0 rounded-[20px] bg-white p-5 text-ink ${className}`}
    >
      {(titulo || acciones) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {titulo && (
            <h2 id={id ? `${id}-titulo` : undefined} className="display text-[19px] text-deep">
              {titulo}
            </h2>
          )}
          {acciones}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, valor, tono }: { label: string; valor: string; tono?: "warn" | "ok" }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3.5 text-ink">
      <dt className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted">{label}</dt>
      <dd
        className={`mt-1 display text-[clamp(17px,2.4vw,22px)] tabular-nums ${
          tono === "warn" ? "text-warn" : tono === "ok" ? "text-ok" : "text-deep"
        }`}
      >
        {valor}
      </dd>
    </div>
  );
}

export function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}

export function Etiqueta({ children, tono = "info" }: { children: React.ReactNode; tono?: "info" | "ok" | "warn" | "void" }) {
  const c = {
    info: "bg-frost text-blue",
    ok: "bg-[#e5f4ea] text-ok",
    warn: "bg-[#fdf1e4] text-warn",
    void: "bg-[#eceef1] text-void",
  }[tono];
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] ${c}`}>
      {children}
    </span>
  );
}
