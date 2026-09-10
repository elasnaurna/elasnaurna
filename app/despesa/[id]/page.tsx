import DetalheDespesa from "@/components/DetalheDespesa";

// [id] é a LINHAGEM da despesa (igual em todas as versões), não o id de uma versão.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetalheDespesa linhagem={id} />;
}
