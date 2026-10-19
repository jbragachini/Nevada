import { getImageProps } from "next/image";
import { Mountain } from "@/components/NevadaLogo";
import { NEVADA_LETTERS_PATH } from "@/components/nevada-letters-path";
import type { Portada as Variante } from "@/lib/storefront";

/**
 * Portada de la página de venta, a pantalla completa: foto con luz, niebla y nieve, la palabra
 * NEVADA y el botón para comprar. Dos versiones: A (camino hacia la montaña) y C (contraluz azul).
 * Celular y escritorio usan fotos distintas.
 */
export function Portada({
  variante,
  linea,
  boton,
}: {
  variante: Variante;
  /** «Navidad con Nevada · Jueves 24.12 · Oncativo» */
  linea: string;
  boton: React.ReactNode;
}) {
  const comun = { alt: "", sizes: "100vw", quality: 80, priority: true } as const;
  const {
    props: { srcSet: escritorio },
  } = getImageProps({ ...comun, src: `/portadas/${variante}-escritorio.jpg`, width: 1920, height: 1200 });
  const { props: celular } = getImageProps({ ...comun, src: `/portadas/${variante}-celular.jpg`, width: 780, height: 1690 });

  return (
    <header className="pv" data-v={variante}>
      <picture>
        <source media="(min-width: 640px)" srcSet={escritorio} />
        <img {...celular} alt="" className="pv-foto" />
      </picture>

      {variante === "a" ? (
        <>
          <div className="pv-capa pv-luz-a" aria-hidden="true" />
          <div className="pv-capa pv-camino" aria-hidden="true" />
        </>
      ) : (
        <>
          <div className="pv-capa pv-estrellas" aria-hidden="true" />
          <div className="pv-capa pv-halo" aria-hidden="true" />
          <div className="pv-capa pv-borde" aria-hidden="true" />
        </>
      )}
      <div className="pv-niebla" aria-hidden="true" />
      <div className="pv-niebla pv-niebla-2" aria-hidden="true" />
      <div className="pv-copos pv-copos-3" aria-hidden="true" />
      <div className="pv-copos pv-copos-2" aria-hidden="true" />
      <div className="pv-copos pv-copos-1" aria-hidden="true" />
      <svg className="pv-capa pv-grano" aria-hidden="true" width="100%" height="100%">
        <filter id={`pv-grano-${variante}`}>
          <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#pv-grano-${variante})`} />
      </svg>
      <div className="pv-sombra-arriba" aria-hidden="true" />
      <div className="pv-sombra-abajo" aria-hidden="true" />
      {variante === "c" && <div className="pv-capa pv-vineta" aria-hidden="true" />}

      {variante === "c" && (
        <div className="pv-cabecera">
          <Mountain className="pv-marca-chica" />
        </div>
      )}

      <div className="pv-logo" role="img" aria-label="Nevada Producciones">
        {variante === "a" && <Mountain className="pv-montana" />}
        <Palabra />
        <p className="pv-producciones pv-entra" aria-hidden="true">
          Producciones
        </p>
      </div>

      <div className="pv-pie pv-entra">
        <p className="pv-linea">{linea}</p>
        {boton}
      </div>
    </header>
  );
}

// El logo tiene NE / VA / DA apilados: cada celda muestra un renglón y quedan en fila.
const RENGLON = 1498 / 3;

function Palabra() {
  return (
    <span className="pv-palabra" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <svg key={i} className="pv-celda" viewBox={`23 ${23 + i * RENGLON} 530 ${RENGLON * 0.97}`}>
          <path d={NEVADA_LETTERS_PATH} fill="currentColor" fillRule="evenodd" />
        </svg>
      ))}
    </span>
  );
}
