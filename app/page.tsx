import { Suspense } from "react";
import ListaDespesas from "@/components/ListaDespesas";

export default function Home() {
  return (
    <Suspense fallback={<p className="px-4 py-10 text-center text-sm text-ink-3">Abrindo o cofre…</p>}>
      <ListaDespesas />
    </Suspense>
  );
}
