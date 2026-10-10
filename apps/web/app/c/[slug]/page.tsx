import type { CompanyRouteProps } from '../../model/route.types';
import { TenantApp } from '../../../src/views/tenant-workspace';
export default async function Page({ params }: CompanyRouteProps) {
  const { slug } = await params;
  return <TenantApp companySlug={slug} />;
}
