import { TankDetailClient } from "@/components/tanks/tank-detail-client";

export default async function TankDetailPage({
  params,
}: {
  params: Promise<{ farmId: string; tankId: string }>;
}) {
  const { farmId, tankId } = await params;
  return <TankDetailClient farmId={farmId} tankId={tankId} />;
}
