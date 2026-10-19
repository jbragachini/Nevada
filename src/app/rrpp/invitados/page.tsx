import { InvitadosManager } from "@/components/rrpp/InvitadosManager";
import { formatEventDate } from "@/lib/format";
import { getMisInvitados } from "@/lib/rrpp";
import { requireRrpp } from "@/lib/sesion";

export default async function InvitadosPage() {
  const sesion = await requireRrpp();
  const { evento, lista } = await getMisInvitados();
  const activos = lista.filter((g) => g.activo).length;
  const tope = sesion.seller?.maxInvitados ?? null;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
        <h1 className="display text-[clamp(22px,4vw,30px)] leading-tight text-white">Invitados</h1>
        {evento && (
          <p className="text-[13px] text-ice tabular-nums">
            {tope === null ? `${activos} invitados` : `${activos} de ${tope} invitados`}
          </p>
        )}
      </div>

      {!evento ? (
        <section className="max-w-xl rounded-[20px] bg-white p-5 text-ink">
          <h2 className="display text-[19px] text-deep">El evento en la página es público</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Cualquiera puede comprar, así que no hace falta invitar. Cuando Nevada ponga un evento con
            invitación, acá vas a armar tu lista: solo compra quien esté en ella, y esas ventas quedan a tu nombre.
          </p>
        </section>
      ) : (
        <InvitadosManager
          evento={{ id: evento.id, nombre: evento.nombre, fecha: formatEventDate(evento.fechaInicio).dia }}
          lista={lista}
          lleno={tope !== null && activos >= tope}
        />
      )}
    </>
  );
}
