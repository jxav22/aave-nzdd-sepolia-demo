"use client";

import { HealthMeter } from "~~/components/ora/HealthMeter";
import { ActionButton, Card, DataRow, Eyebrow, Note, Stat } from "~~/components/ora/primitives";
import type { HackathonAssetSymbol } from "~~/config/aaveHackathonMnzd";
import type { ReserveSummary } from "~~/hooks/aave/useHackathonMarket";
import type { UserPositions } from "~~/hooks/aave/useUserPositions";
import { formatBase, formatNzd, formatPercent, formatToken } from "~~/utils/format/money";

/**
 * Where the account stands.
 *
 * Adaptive by design: someone who has only deposited New Zealand dollars sees their balance and
 * the rate it earns, and nothing about collateral, health factors or liquidation, none of it
 * applies to them, and showing it would be alarming for no reason. The collateral and health
 * section appears only once there is collateral or a loan.
 */

const COLLATERAL_LABEL: Record<string, string> = {
  wETH: "Ether",
  wBTC: "Bitcoin",
};

export const OverviewPanel = ({
  positions,
  reserveBySymbol,
  onGoToEarn,
  onGoToBorrow,
}: {
  positions: UserPositions;
  reserveBySymbol: Record<HackathonAssetSymbol, ReserveSummary | undefined>;
  onGoToEarn: () => void;
  onGoToBorrow: () => void;
}) => {
  const nzd = positions.positions.dNZD;
  const nzdReserve = reserveBySymbol.dNZD;
  const showsBorrowing = positions.hasCollateral || positions.hasAnyDebt;

  const collateralAssets = (["wETH", "wBTC"] as HackathonAssetSymbol[]).filter(
    symbol => positions.positions[symbol].deposited > 0n || positions.positions[symbol].walletBalance > 0n,
  );

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className={showsBorrowing ? "lg:col-span-2" : "lg:col-span-3"}>
        <div className="flex items-baseline justify-between gap-4">
          <Eyebrow>Your New Zealand dollars</Eyebrow>
          {nzdReserve ? (
            <span className="text-xs text-muted-foreground">Earning {formatPercent(nzdReserve.supplyApyPercent)}</span>
          ) : null}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-8 sm:grid-cols-3">
          <Stat
            label="Deposited"
            value={formatNzd(nzd.deposited, nzd.decimals)}
            accent={nzd.deposited > 0n}
            hint={nzdReserve ? `Earning ${formatPercent(nzdReserve.supplyApyPercent)}` : undefined}
          />
          <Stat label="Available" value={formatNzd(nzd.walletBalance, nzd.decimals)} hint="Not yet deposited" />
          {positions.hasAnyDebt ? (
            <Stat label="Borrowed" value={formatNzd(nzd.borrowed, nzd.decimals)} hint="Interest accruing" />
          ) : (
            <Stat label="Rate" value={nzdReserve ? formatPercent(nzdReserve.supplyApyPercent) : "-"} hint="Variable" />
          )}
        </div>

        <div className="hairline mt-8 flex flex-wrap gap-3 pt-6">
          <ActionButton onClick={onGoToEarn}>
            {nzd.deposited > 0n ? "Deposit more" : "Deposit and start earning"}
          </ActionButton>
          <ActionButton tone="outline" onClick={onGoToBorrow}>
            {positions.hasAnyDebt ? "Manage your loan" : "Borrow against your crypto"}
          </ActionButton>
        </div>

        {nzd.deposited === 0n && nzd.walletBalance === 0n && !showsBorrowing ? (
          <Note tone="info" className="mt-6" title="Nothing here yet">
            Once your account holds New Zealand dollars, or you deposit ETH or Bitcoin as collateral, your position will
            appear here.
          </Note>
        ) : null}
      </Card>

      {showsBorrowing ? (
        <Card>
          <Eyebrow>Your collateral</Eyebrow>

          <div className="mt-4">
            <div className="tabular font-display text-4xl">{formatBase(positions.totalCollateralBase)}</div>
            <div className="mt-1 text-sm text-muted-foreground">Total value held as security</div>
          </div>

          <div className="mt-5 divide-y divide-border">
            {collateralAssets.map(symbol => {
              const position = positions.positions[symbol];
              const reserve = reserveBySymbol[symbol];
              return (
                <DataRow
                  key={symbol}
                  label={COLLATERAL_LABEL[symbol]}
                  value={formatToken(position.deposited, position.decimals, symbol === "wETH" ? "ETH" : "BTC")}
                  hint={reserve ? `${formatBase(reserve.oraclePrice)} each` : undefined}
                />
              );
            })}
            {positions.hasAnyDebt ? (
              <DataRow label="Borrowed against it" value={formatNzd(nzd.borrowed, nzd.decimals)} />
            ) : null}
            <DataRow label="Still available to borrow" value={formatBase(positions.availableBorrowsBase)} />
          </div>

          <div className="hairline mt-6 pt-5">
            <HealthMeter healthFactor={positions.healthFactor} />
          </div>
        </Card>
      ) : null}
    </div>
  );
};
