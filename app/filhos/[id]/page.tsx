import FilhoTela from "@/components/FilhoTela";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FilhoTela linhagem={id} />;
}
