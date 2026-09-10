import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AlimentaProva — despesas do seu filho e pensão, comprovadas",
    short_name: "AlimentaProva",
    description: "Registre as despesas do seu filho com comprovante, em vinte segundos.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f4f6",
    theme_color: "#1f4d8f",
    lang: "pt-BR",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
