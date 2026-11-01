import { Receipt } from "@/components/Receipt";

export const metadata = { title: "Receipt | Settled" };

export default async function ReceiptPage({ params }: { params: Promise<{ sender: string; key: string }> }) {
  const { sender, key } = await params;
  return (
    <>
      <h1>Receipt</h1>
      <Receipt sender={decodeURIComponent(sender)} recordKey={decodeURIComponent(key)} />
    </>
  );
}
