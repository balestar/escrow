import ClientEscrowFlow from "@/components/ClientEscrowFlow";

export default async function PaySessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClientEscrowFlow sessionId={id} />;
}
