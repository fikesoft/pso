import type { Dispatch, SetStateAction } from 'react';
import type { CatalogResponse } from '@pos/contracts';
import type { useRemoteData } from '../../../shared/lib';
export type SetCatalogData = Dispatch<SetStateAction<CatalogResponse | null>>;
export type CatalogResource = ReturnType<typeof useRemoteData<CatalogResponse>>;
