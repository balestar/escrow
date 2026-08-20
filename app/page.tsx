import dynamic from "next/dynamic";

const EscrowFlow = dynamic(() => import("@/components/EscrowFlow"), { ssr: false });

export default function Home() {
  return <EscrowFlow />;
}
