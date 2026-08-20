import { FarmDetailClient } from "@/components/farms/farm-detail-client";

export default async function FarmDetailPage({
  params,
}: {
  params: Promise<{ farmId: string }>;
}) {
  const { farmId } = await params;
  return <FarmDetailClient farmId={farmId} />;
}
