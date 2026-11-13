import { getContacto } from "@/lib/contacto";

/** Contacto y redes de Nevada, al pie de las pantallas del comprador. Sin datos cargados no muestra nada. */
export function Contacto() {
  const c = getContacto();
  if (!c.instagram && !c.whatsapp && !c.email) return null;
  const link =
    "inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-[13px] font-semibold text-frost transition-colors hover:border-ice hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ice";
  return (
    <nav aria-label="Contacto de Nevada Producciones" className="mt-2 flex flex-wrap items-center justify-center gap-2">
      {c.instagram && (
        <a className={link} href={`https://www.instagram.com/${c.instagram}`} target="_blank" rel="noopener noreferrer">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <path d="M17.5 6.5h.01" />
          </svg>
          @{c.instagram}
        </a>
      )}
      {c.whatsapp && (
        <a className={link} href={`https://wa.me/${c.whatsapp}`} target="_blank" rel="noopener noreferrer">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20.5l1.7-5.2A8.5 8.5 0 1 1 21 11.5z" />
          </svg>
          WhatsApp
        </a>
      )}
      {c.email && (
        <a className={link} href={`mailto:${c.email}`}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
          {c.email}
        </a>
      )}
    </nav>
  );
}
