import DetalhePagamento from "@/components/DetalhePagamento";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetalhePagamento linhagem={id} />;
}
