import { Suspense } from "react";
import Pensao from "@/components/Pensao";

export default function PensaoPage() {
  return (
    <Suspense fallback={<p className="px-4 py-10 text-center text-sm text-ink-3">Abrindo o cofre…</p>}>
      <Pensao />
    </Suspense>
  );
}
