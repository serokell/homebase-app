import { MetadataCarrierDeploymentData } from "services/contracts/baseDAO/metadataCarrier/types";
import { BaseStorageParams } from "../types";

export interface TreasuryParams {
  storage: BaseStorageParams;
  metadataCarrierDeploymentData: MetadataCarrierDeploymentData;
}

export type TreasuryParamsWithoutMetadata = Omit<
  TreasuryParams,
  "metadataCarrierDeploymentData"
>;
