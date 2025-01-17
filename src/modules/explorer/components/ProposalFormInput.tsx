import React from "react";
import {Grid, styled, Typography} from "@material-ui/core";

const StyledBody = styled(Grid)(({theme}) => ({
  borderRadius: 4,
  background: theme.palette.primary.main,
  padding: "0 20px",
  minHeight: 54,
  "& input": {
    minHeight: 54,
    padding: 0,
    textAlign: "start"
  },
}))

export const ProposalFormInput: React.FC<{ label?: string }> = ({label, children}) => {
  return (
    <Grid container direction={"column"} style={{gap: 18}}>
      {label ? <Grid item>
        <Typography variant={"body1"} style={{fontWeight: 500}} color={"textPrimary"}>{label}</Typography>
      </Grid> : null}
      <StyledBody>
        {children}
      </StyledBody>
    </Grid>
  )
}