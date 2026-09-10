"use client";

// Liga a sincronização automática enquanto o app estiver aberto. Não renderiza nada.

import { useEffect } from "react";
import { iniciarSync } from "@/lib/sync";

export default function Sincronizador() {
  useEffect(() => iniciarSync(), []);
  return null;
}
