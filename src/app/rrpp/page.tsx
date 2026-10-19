import { CargarVenta } from "@/components/rrpp/CargarVenta";
import { LinkPersonal } from "@/components/rrpp/LinkPersonal";
import { VentasList } from "@/components/rrpp/VentasList";
import { formatARS } from "@/lib/format";
import { getEventosParaCargar, getMisVentas, getPanel } from "@/lib/rrpp";
import { requireRrpp } from "@/lib/sesion";

export default async function RrppPage() {
  const sesion = await requireRrpp();
  const [panel, ventas, eventos] = await Promise.all([getPanel(), getMisVentas(), getEventosParaCargar()]);
  if (!panel || !sesion.seller) return null;

  const pendiente = panel.comisionGenerada - panel.comisionCobrada;
  const debeEfectivo = Math.max(0, panel.cobradoEfectivo - panel.rendidoEfectivo);
  const debeTransferencia = Math.max(0, panel.cobradoTransferencia - panel.rendidoTransferencia);
  const aRendir = debeEfectivo + debeTransferencia;
  const sitio = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.nevadaproducciones.com").replace(/\/$/, "");

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
        <h1 className="display text-[clamp(22px,4vw,30px)] leading-tight text-white">
          Hola, {sesion.seller.nombrePublico.split(" ")[0]}
        </h1>
        <p className="text-[13px] text-ice">Solo ves tus ventas y tus comisiones</p>
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Entradas vendidas" valor={String(panel.entradas)} />
        <Stat label="Vendido" valor={formatARS(panel.vendido)} chico />
        <Stat label="Comisión pendiente" valor={formatARS(pendiente)} chico />
        <Stat label="Tenés que rendir" valor={formatARS(aRendir)} chico tono="warn" />
      </dl>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          <section aria-labelledby="comisiones" className="rounded-[20px] bg-white p-5 text-ink">
            <h2 id="comisiones" className="display text-[19px] text-deep">
              Mis comisiones
            </h2>
            <dl className="mt-2 divide-y divide-line text-sm">
              <Fila label="Generada (pedidos aprobados)" valor={formatARS(panel.comisionGenerada)} />
              <Fila label="Ya cobrada (te pagó Nevada)" valor={formatARS(panel.comisionCobrada)} />
              <div className="flex items-baseline justify-between gap-4 py-3">
                <dt className="font-bold text-blue">Pendiente de cobro</dt>
                <dd className="display text-xl text-deep tabular-nums">{formatARS(pendiente)}</dd>
              </div>
              <div className="flex flex-col gap-1 py-3">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="font-bold text-warn">Tenés que rendir a Nevada</dt>
                  <dd className="font-bold text-warn tabular-nums">{formatARS(aRendir)}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-x-4 text-[12.5px] text-muted tabular-nums">
                  <span>Efectivo {formatARS(debeEfectivo)}</span>
                  <span>Transferencias a tu nombre {formatARS(debeTransferencia)}</span>
                </div>
              </div>
            </dl>
            {panel.porTipo.length > 0 && (
              <p className="text-[12.5px] text-muted">
                {panel.porTipo.map((t) => `${t.cantidad} ${t.nombre}`).join(" · ")}
              </p>
            )}
          </section>

          <LinkPersonal url={`${sitio}/?rrpp=${sesion.seller.codigo}`} />

          <VentasList ventas={ventas} porAprobar={panel.porAprobar} />
        </div>

        <section aria-labelledby="cargar" className="min-w-0 rounded-[20px] bg-white p-5 text-ink">
          <h2 id="cargar" className="display text-[19px] text-deep">
            Cargar una venta
          </h2>
          {sesion.seller.puedeCargarVentas ? (
            <CargarVenta eventos={eventos} />
          ) : (
            <p className="mt-3 text-sm text-muted">
              Nevada no te habilitó para cargar ventas. Podés vender con tu link personal.
            </p>
          )}
        </section>
      </div>
    </>
  );
}

function Stat({ label, valor, chico = false, tono }: { label: string; valor: string; chico?: boolean; tono?: "warn" }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3.5 text-ink">
      <dt className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted">{label}</dt>
      <dd
        className={`mt-1 display tabular-nums ${chico ? "text-[clamp(17px,2.4vw,21px)]" : "text-[26px]"} ${
          tono === "warn" ? "text-warn" : "text-deep"
        }`}
      >
        {valor}
      </dd>
    </div>
  );
}

function Fila({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt>{label}</dt>
      <dd className="font-bold tabular-nums">{valor}</dd>
    </div>
  );
}
