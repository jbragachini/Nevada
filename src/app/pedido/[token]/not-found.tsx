import Link from "next/link";
import { NevadaLogo } from "@/components/NevadaLogo";
import { TicketShell } from "@/components/TicketShell";
import { FlechaGl } from "@/components/FlechaGl";

export default function PedidoNoEncontrado() {
  return (
    <TicketShell
      head={
        <div className="flex justify-center">
          <NevadaLogo height={72} />
        </div>
      }
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="display text-[22px] leading-none text-deep">NO ENCONTRAMOS ESE PEDIDO</h1>
        <p className="max-w-[34ch] text-sm leading-relaxed text-muted text-pretty">
          Revisá que el link esté completo, tal como te llegó por mail. Si el problema sigue, escribinos por
          Instagram con tu número de pedido.
        </p>
        <Link
          href="/"
          className="mt-2 gl w-full"
        >
          <span>Ir a las entradas</span>
          <FlechaGl />
        </Link>
      </div>
    </TicketShell>
  );
}
