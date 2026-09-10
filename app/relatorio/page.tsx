import { Suspense } from "react";
import Relatorio from "@/components/Relatorio";

// Suspense é exigido pelo useSearchParams() no componente cliente.
export default function RelatorioPage() {
  return (
    <Suspense fallback={<p className="px-4 py-10 text-center text-sm text-ink-3">Preparando o relatório…</p>}>
      <Relatorio />
    </Suspense>
  );
}
