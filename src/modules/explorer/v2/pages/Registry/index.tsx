import {Button, Grid, Tooltip, useMediaQuery, useTheme} from "@material-ui/core";
import { CopyAddress } from "modules/common/CopyAddress";
import {
  ProposalFormContainer,
  ProposalFormDefaultValues,
} from "modules/explorer/components/ProposalForm";

import React, { useMemo, useState } from "react";
import { RegistryDAO } from "services/contracts/baseDAO";
import { useDAO } from "services/indexer/dao/hooks/useDAO";
import { useProposals } from "services/indexer/dao/hooks/useProposals";
import { RegistryProposal } from "services/indexer/dao/mappers/proposal/types";
import { Hero } from "../../components/Hero";
import { HeroTitle } from "../../components/HeroTitle";
import { useDAOID } from "../DAO/router";
import { RegistryTable } from "./components/RegistryTable";
import { UpdatesTable } from "./components/UpdatesTable";
import {useIsProposalButtonDisabled} from "../../../../../services/contracts/baseDAO/hooks/useCycleInfo";
import {InfoIcon} from "../../../components/styled/InfoIcon";

export const Registry: React.FC = () => {
  const theme = useTheme();
  const isMobileSmall = useMediaQuery(theme.breakpoints.down("sm"));
  const daoId = useDAOID();
  const { data: dao } = useDAO(daoId);
  const [updateRegistryOpen, setUpdateRegistryOpen] = useState(false);
  const { data: proposalsData } = useProposals(daoId);
  const [defaultData, setDefaultData] = useState<ProposalFormDefaultValues>();
  const shouldDisable = useIsProposalButtonDisabled(daoId);

  const onCloseRegistryUpdate = () => {
    setUpdateRegistryOpen(false);
    setDefaultData(undefined);
  };

  const proposals = useMemo(() => {
    if (!proposalsData || !dao) {
      return [];
    }

    const registryDAO = dao as RegistryDAO;
    const registryProposalsData = proposalsData as RegistryProposal[];

    const registryAffectedKeysProposalIds =
      registryDAO.decoded.decodedRegistryAffected.map((r) => r.proposalId);

    return registryProposalsData
      .filter((proposal) =>
        registryAffectedKeysProposalIds.includes(proposal.id)
      )
      .sort(
        (a, b) =>
          new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      )
      .map((proposal) => ({
        ...proposal,
        description: "Proposal description",
        address: proposal.id,
        lastUpdated: proposal.startDate,
        list: proposal.metadata.list,
        proposalId: proposal.id,
        agoraPostId: Number(proposal.metadata.agoraPostId),
      }))
      .flatMap((proposal) =>
        proposal.list.map(({ key }) => ({
          ...proposal,
          key,
        }))
      );
  }, [dao, proposalsData]);

  const onClickItem = (item: { key: string; value: string }) => {
    setDefaultData({
      registryUpdateForm: {
        isBatch: false,
        list: [item],
      },
    });
    setUpdateRegistryOpen(true);
  };

  const registryList = useMemo(() => {
    if (!dao || !proposals) {
      return [];
    }

    return (dao as RegistryDAO).decoded.decodedRegistry.map((d) => ({
      ...d,
      lastUpdated: proposals.find((proposal) => proposal.key === d.key)
        ?.startDate,
      onClick: () => onClickItem(d)
    }));
  }, [dao, proposals]);

  return (
    <>
      <Grid container direction="column" style={{ gap: 42 }}>
        <Hero>
          <Grid item>
            <HeroTitle>Registry</HeroTitle>
            {dao && (
              <CopyAddress
                address={dao.data.address}
                justify={isMobileSmall ? "center" : "flex-start"}
                typographyProps={{
                  variant: "subtitle2",
                }}
              />
            )}
          </Grid>
          <Grid item>
            <Button
              variant="contained"
              color="secondary"
              onClick={() => setUpdateRegistryOpen(true)}
              disabled={shouldDisable}
            >
              New Item
            </Button>
            {shouldDisable && (
              <Tooltip
                placement="bottom"
                title="Not on proposal creation period"
              >
                <InfoIcon color="secondary" />
              </Tooltip>
            )}
          </Grid>
        </Hero>
        <Grid item>
          <RegistryTable data={registryList} />
        </Grid>
        <Grid item>
          <UpdatesTable data={proposals} />
        </Grid>
      </Grid>
      <ProposalFormContainer
        open={updateRegistryOpen}
        handleClose={onCloseRegistryUpdate}
        defaultTab={2}
        defaultValues={defaultData}
      />
    </>
  );
};
