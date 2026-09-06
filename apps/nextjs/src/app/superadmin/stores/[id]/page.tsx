import { StoreDetailView } from "./store-detail-view";

export default async function SuperadminStoreDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StoreDetailView storeId={id} />;
}
