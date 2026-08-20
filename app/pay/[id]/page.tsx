import dynamic from "next/dynamic";

const EscrowFlow = dynamic(() => import("@/components/EscrowFlow"), { ssr: false });

export default async function PaySessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EscrowFlow sessionId={id} />;
}
