export interface WorkspaceContext {
  organizationId: string;
  locationId: string;
}
export interface DraftProduct {
  id: string;
  name: string;
}
export interface DraftItem extends DraftProduct {
  quantity: number;
}
export interface WorkspaceState extends WorkspaceContext {
  view: string;
  draft: DraftItem[];
}
