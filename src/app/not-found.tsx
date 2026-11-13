import Link from "next/link";
import { FlechaGl } from "@/components/FlechaGl";
import { NevadaLogo } from "@/components/NevadaLogo";
import { TicketShell } from "@/components/TicketShell";

export default function NoEncontrada() {
  return (
    <TicketShell
      head={
        <div className="flex justify-center">
          <NevadaLogo height={72} />
        </div>
      }
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="display text-[22px] leading-none text-deep">ESA PÁGINA NO EXISTE</h1>
        <p className="max-w-[34ch] text-sm leading-relaxed text-muted text-pretty">
          Puede que el link esté incompleto o que ya no esté disponible.
        </p>
        <Link href="/" className="mt-2 gl w-full">
          <span>Ir a las entradas</span>
          <FlechaGl />
        </Link>
      </div>
    </TicketShell>
  );
}
