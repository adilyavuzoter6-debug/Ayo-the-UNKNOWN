import { AdminCompanyDetailClient } from "@/components/admin/admin-company-detail-client";

export default async function AdminCompanyPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  return <AdminCompanyDetailClient companyId={companyId} />;
}
