import EscrowFlow from "@/components/EscrowFlow";

export default async function PaySessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EscrowFlow sessionId={id} />;
}
