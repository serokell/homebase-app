import {ContractAbstraction, TezosToolkit, TransactionWalletOperation, Wallet,} from "@taquito/taquito";
import {DAOTemplate, MigrationParams} from "modules/creator/state";
import {Network} from "services/beacon/context";
import {ConfigProposalParams, fromStateToBaseStorage, getContract} from ".";
import {MetadataDeploymentResult} from "../metadataCarrier/deploy";
import {generateStorageContract} from "services/baseDAODocker";
import baseDAOContractCode from "./michelson/baseDAO";
import { formatUnits, xtzToMutez } from "../utils";
import { BigNumber } from "bignumber.js";
import { Token } from "models/Token";
import { Ledger } from "services/indexer/types";
import {Expr, Parser} from "@taquito/michel-codec";
import {Schema} from "@taquito/michelson-encoder";
import proposeCode from "./registryDAO/michelson/propose"

interface DeployParams {
  params: MigrationParams;
  metadata: MetadataDeploymentResult;
  tezos: TezosToolkit;
  network: Network;
}

export type CycleType = "voting" | "proposing";

export interface CycleInfo {
  blocksLeft: number;
  currentCycle: number;
  currentLevel: number;
  type: CycleType;
}

export interface BaseDAOData {
  id: number;
  admin: string;
  address: string;
  frozen_token_id: number;
  token: Token;
  guardian: string;
  ledger: Ledger[];
  max_proposals: string;
  max_quorum_change: string;
  max_quorum_threshold: string;
  max_voters: string;
  min_quorum_threshold: string;
  period: string;
  proposal_expired_level: string;
  proposal_flush_level: string;
  quorum_change: string;
  last_updated_cycle: string;
  quorum_threshold: BigNumber;
  staked: string;
  start_level: number;
  name: string;
  description: string;
  type: DAOTemplate;
  network: Network;
  extra: {
    frozen_extra_value: string;
  }
}

export abstract class BaseDAO {
  public static baseDeploy = async (
    template: DAOTemplate,
    { params, metadata, tezos, network }: DeployParams
  ): Promise<ContractAbstraction<Wallet>> => {
    const treasuryParams = fromStateToBaseStorage(params);

    if (!metadata.deployAddress) {
      throw new Error(
        "Error deploying treasury DAO: There's not address of metadata"
      );
    }

    const account = await tezos.wallet.pkh();

    try {
      console.log("Making storage contract...");
      const storageCode = await generateStorageContract({
        network,
        template,
        storage: treasuryParams,
        originatorAddress: account,
        metadata,
      });
      console.log("Originating DAO contract...");

      console.log(baseDAOContractCode)
      console.log(treasuryParams)
      console.log(storageCode)

      const t = await tezos.wallet.originate({
        code: baseDAOContractCode,
        init: storageCode,
      });

      const operation = await t.send();
      console.log("Waiting for confirmation on DAO contract...", t);
      const { address } = await operation.contract();

      return await tezos.wallet.at(address);
    } catch (e) {
      console.log("error ", e);
      throw new Error("Error deploying DAO");
    }
  };

  protected constructor(public data: BaseDAOData) {}

  public flush = async (
    numerOfProposalsToFlush: number,
    tezos: TezosToolkit
  ) => {
    const daoContract = await getContract(tezos, this.data.address);
    const operation = await daoContract.methods.flush(numerOfProposalsToFlush);

    const result = await operation.send();
    return result;
  };

  public dropProposal = async (proposalId: string, tezos: TezosToolkit) => {
    const contract = await getContract(tezos, this.data.address);

    const result = await contract.methods.drop_proposal(proposalId).send();
    return result;
  };

  public sendXtz = async (xtzAmount: BigNumber, tezos: TezosToolkit) => {
    const contract = await getContract(tezos, this.data.address);

    const result = await contract.methods.callCustom("receive_xtz", "").send({
      amount: xtzToMutez(xtzAmount).toNumber(),
      mutez: true,
    });
    return result;
  };

  public vote = async ({
    proposalKey,
    amount,
    support,
    tezos,
  }: {
    proposalKey: string;
    amount: BigNumber;
    support: boolean;
    tezos: TezosToolkit;
  }) => {
    const contract = await getContract(tezos, this.data.address);
    const result = await contract.methods
      .vote([
        {
          argument: {
            from: await tezos.wallet.pkh(),
            proposal_key: proposalKey,
            vote_type: support,
            vote_amount: formatUnits(
              amount,
              this.data.token.decimals
            ).toString(),
          },
        },
      ])
      .send();

    return result;
  };

  public freeze = async (amount: BigNumber, tezos: TezosToolkit) => {
    const daoContract = await getContract(tezos, this.data.address);
    const govTokenContract = await getContract(tezos, this.data.token.contract);
    const tokenMetadata = this.data.token;
    const batch = await tezos.wallet
      .batch()
      .withContractCall(
        govTokenContract.methods.update_operators([
          {
            add_operator: {
              owner: await tezos.wallet.pkh(),
              operator: this.data.address,
              token_id: this.data.token.token_id,
            },
          },
        ])
      )
      .withContractCall(
        daoContract.methods.freeze(
          formatUnits(amount, tokenMetadata.decimals).toString()
        )
      )
      .withContractCall(
        govTokenContract.methods.update_operators([
          {
            remove_operator: {
              owner: await tezos.wallet.pkh(),
              operator: this.data.address,
              token_id: this.data.token.token_id,
            },
          },
        ])
      );

    const result = await batch.send();
    return result;
  };

  public unfreeze = async (amount: BigNumber, tezos: TezosToolkit) => {
    const contract = await getContract(tezos, this.data.address);

    const result = await contract.methods
      .unfreeze(formatUnits(amount, this.data.token.decimals).toString())
      .send();
    return result;
  };

  static async encodeProposalMetadata(dataToEncode: any, michelsonSchemaString: string, tezos: TezosToolkit) {
    const parser = new Parser();

    const michelsonType = parser.parseData(michelsonSchemaString);
    const schema = new Schema(michelsonType as Expr);
    const data = schema.Encode(dataToEncode);

    const { packed } = await tezos.rpc.packData({
      data,
      type: michelsonType as Expr,
    });

    return packed;
  }

  public async proposeConfigChange (configParams: ConfigProposalParams, tezos: TezosToolkit) {
    const contract = await getContract(tezos, this.data.address);
    const proposalMetadata = await BaseDAO.encodeProposalMetadata({
      configuration_proposal: {
        frozen_extra_value: configParams.frozen_extra_value,
        frozen_scale_value: configParams.frozen_scale_value,
        max_proposal_size: configParams.max_proposal_size,
        slash_division_value: configParams.slash_division_value,
        slash_scale_value: configParams.slash_scale_value
      },
    }, proposeCode, tezos)

    const contractMethod = contract.methods.propose(
        await tezos.wallet.pkh(),
        this.data.extra.frozen_extra_value,
        proposalMetadata
    );

    return await contractMethod.send();
  }

  public async proposeGuardianChange(newGuardianAddress: string, tezos: TezosToolkit) {
    const contract = await getContract(tezos, this.data.address);

    const proposalMetadata = await BaseDAO.encodeProposalMetadata({
      update_guardian: newGuardianAddress,
    }, proposeCode, tezos)

    const contractMethod = contract.methods.propose(
        await tezos.wallet.pkh(),
        this.data.extra.frozen_extra_value,
        proposalMetadata
    );

    return await contractMethod.send();
  }

  public abstract propose(...args: any[]): Promise<TransactionWalletOperation>;
}
