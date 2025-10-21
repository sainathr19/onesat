"use client";

import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useWallet } from "@/store/useWallet";
import { useVesuHistory } from "@/hooks/useVesuHistory";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import HistoryCard from "@/components/history/HistoryCard";
import HistoryCardSkeleton from "@/components/skeletons/HistoryCardSkeleton";
import { DepositStatus } from "@/components/history/DepositStatus";
import { VesuHistoryResponse } from "@/types/vesu";
import { depositAPI } from "@/lib/api";
import Pagination from "@/components/earn/Pagination";

interface HistoryPageProps {
  className?: string;
}

const HistoryPage: React.FC<HistoryPageProps> = ({ className }) => {
  const { connected, starknetAddress, connect } = useWallet();
  const { history, loading: historyLoading } = useVesuHistory(starknetAddress);
  const [selectedDeposit, setSelectedDeposit] = useState<VesuHistoryResponse | null>(null);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [swapState, setSwapState] = useState<number>(0);
  const [selectedCardStatus, setSelectedCardStatus] = useState<string>("created");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Track BTC confirmations for each deposit
  const [confirmationsMap, setConfirmationsMap] = useState<Record<string, number>>({});

  // Reset pagination when history changes
  useEffect(() => {
    setCurrentPage(1);
  }, [history]);

  // Poll BTC confirmations for specific deposits that need it
  useEffect(() => {
    if (!history || history.length === 0) return;

    const getBtcConfirmations = async (txid: string): Promise<number> => {
      try {
        const txResp = await fetch(`/api/mempool/testnet4/api/tx/${txid}`, { cache: "no-store" });
        if (!txResp.ok) return 0;
        const tx = await txResp.json();

        // Check if transaction is confirmed
        if (!tx.status?.confirmed) return 0;

        const blockHeight: number | undefined = tx?.status?.block_height;
        if (!blockHeight) return 0;

        const tipResp = await fetch(`/api/mempool/testnet4/api/blocks/tip/height`, { cache: "no-store" });
        if (!tipResp.ok) return 0;
        const tipText = await tipResp.text();
        const tipHeight = Number(tipText);
        if (Number.isNaN(tipHeight)) return 0;

        return Math.max(0, tipHeight - blockHeight + 1);
      } catch {
        return 0;
      }
    };

    const pollConfirmations = async () => {
      for (const deposit of history) {
        // Only poll for deposits that:
        // 1. Are not expired (not checking expiration here, just status)
        // 2. Are not deposited (backend handles this)
        // 3. Have a BTC tx hash
        if (deposit.status === "deposited") continue;
        if (!deposit.btc_tx_hash) continue;

        try {
          const confirmations = await getBtcConfirmations(deposit.btc_tx_hash);

          // Update confirmations map
          setConfirmationsMap(prev => ({
            ...prev,
            [deposit.deposit_id]: confirmations
          }));

          // If we have 2+ confirmations, update the backend status
          if (confirmations >= 2 && deposit.status === "created") {
            // We could update backend here if needed, but for now just let the UI reflect it
            console.log(`Deposit ${deposit.deposit_id} has ${confirmations} confirmations`);
          }
        } catch (error) {
          console.error(`Failed to check confirmations for ${deposit.deposit_id}:`, error);
        }
      }
    };

    // Poll every 30 seconds for BTC confirmations
    pollConfirmations();
    const interval = setInterval(pollConfirmations, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);


  // Poll deposit status when a deposit is selected
  useEffect(() => {
    if (!selectedDeposit || !isStatusOpen) return;

    const pollDepositStatus = async () => {
      try {
        const result = await depositAPI.getDeposit(selectedDeposit.deposit_id);

        // Get BTC tx hash from backend
        const btcTxId = result.btc_tx_hash || null;
        const confirmations = confirmationsMap[selectedDeposit.deposit_id] || 0;

        // Determine status based on backend data + confirmations
        let effectiveStatus = result.status;
        if (result.status === "deposited") {
          effectiveStatus = "deposited";
        } else if (confirmations >= 2) {
          effectiveStatus = "redeemed";
        } else if (btcTxId) {
          effectiveStatus = "initiated";
        }

        setSelectedCardStatus(effectiveStatus);

        // Update swap state for progress bar
        if (effectiveStatus === "deposited") {
          setSwapState(3);
        } else if (confirmations >= 2) {
          setSwapState(2);
        } else if (btcTxId) {
          setSwapState(1);
        } else {
          setSwapState(0);
        }
      } catch (e: any) {
        console.error("Failed to fetch deposit status:", e?.message);
      }
    };

    // Poll immediately
    pollDepositStatus();

    // Poll every 5 seconds
    const interval = setInterval(pollDepositStatus, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeposit, isStatusOpen, confirmationsMap]);

  const handleCardClick = (deposit: VesuHistoryResponse) => {
    setSelectedDeposit(deposit);
    setIsStatusOpen(true);

    // Determine the card's effective status from backend data + confirmations
    const hasBtcTx = Boolean(deposit.btc_tx_hash);
    const confirmations = confirmationsMap[deposit.deposit_id] || 0;
    const hasBtcConfirmations = confirmations >= 2;

    let cardStatus = "created";
    if (deposit.status === "deposited") {
      cardStatus = "deposited";
    } else if (hasBtcConfirmations) {
      cardStatus = "redeemed";
    } else if (hasBtcTx) {
      cardStatus = "initiated";
    } else {
      cardStatus = "created";
    }

    setSelectedCardStatus(cardStatus);

    // Initialize swap state based on deposit data + confirmations
    if (deposit.status === "deposited") {
      setSwapState(3);
    } else if (hasBtcConfirmations) {
      setSwapState(2);
    } else if (hasBtcTx) {
      setSwapState(1);
    } else {
      setSwapState(0);
    }
  };

  const handleCloseStatus = () => {
    setIsStatusOpen(false);
    setSelectedDeposit(null);
  };

  if (!connected && !historyLoading) {
    return (
      <div
        className={cn(
          "min-h-screen flex items-center justify-center px-4",
          className
        )}
      >
        <Card className="max-w-lg w-full p-6 xs:p-8 text-center space-y-4 xs:space-y-6">
          <div className="space-y-2">
            <h1 className="font-mono text-3xl font-bold">History</h1>
            <p className="font-mono text-base text-gray-600">
              Connect your wallet to view your transaction history
            </p>
          </div>
          <Button onClick={connect} className="w-full">
            Connect Wallet
          </Button>
        </Card>
      </div>
    );
  }

  // Calculate summary statistics
  const calculateSummaryStats = () => {
    if (!history || history.length === 0) {
      return {
        totalDeposits: "0",
        totalValue: "$0.00",
        successRate: "0.00%",
      };
    }

    let totalDeposits = 0;
    let totalValue = 0;
    let successfulDeposits = 0;

    history.forEach((transaction) => {
      totalDeposits++;
      const amount = parseFloat(transaction.amount);
      totalValue += amount;

      if (transaction.status === "deposited") {
        successfulDeposits++;
      }
    });

    const successRate =
      totalDeposits > 0 ? (successfulDeposits / totalDeposits) * 100 : 0;

    return {
      totalDeposits: totalDeposits.toString(),
      totalValue: `$${totalValue.toFixed(2)}`,
      successRate: `${successRate.toFixed(1)}%`,
    };
  };

  const summaryStats = calculateSummaryStats();

  // Pagination logic
  const totalPages = Math.ceil((history?.length || 0) / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = history?.slice(startIndex, endIndex) || [];

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // Scroll to top when page changes
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Helper to compute effective status for a deposit
  const getEffectiveStatus = (deposit: VesuHistoryResponse): string => {
    // Check if expired first (2 hours for created status with NO BTC tx hash)
    if (deposit.status === "created" && deposit.created_at && !deposit.btc_tx_hash) {
      const now = new Date();
      const createdAt = new Date(deposit.created_at);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours
      if (createdAt < twoHoursAgo) {
        return "expired";
      }
    }

    // BTC tx hash from backend
    const hasBtcTx = Boolean(deposit.btc_tx_hash);
    const confirmations = confirmationsMap[deposit.deposit_id] || 0;

    const effectiveStatus = (() => {
      if (deposit.status === "deposited") return "deposited";
      if (confirmations >= 2) return "redeemed";
      if (hasBtcTx) return "initiated";
      return "created";
    })();

    return effectiveStatus;
  };

  return (
    <div className={cn("min-h-screen py-12 px-4 sm:px-6 lg:px-8", className)}>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header with Summary Stats */}
        <div className="flex w-full flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div className="flex w-full flex-col sm:flex-row items-center justify-between gap-6 xs:gap-8 lg:gap-12">
            <h1 className="font-mono flex items-start flex-col text-xl xs:text-2xl sm:text-3xl lg:text-5xl leading-tight text-center sm:text-left">
              <span>History</span>
              <p className="font-mono text-xs xs:text-sm sm:text-md xl:text-lg max-w-md text-center sm:text-right">
                {starknetAddress
                  ? `${starknetAddress.slice(0, 6)}...${starknetAddress.slice(
                    -4
                  )}`
                  : ""}
              </p>
            </h1>

            {/* Summary Statistics */}
            <div className="flex gap-8 w-fit">
              <div className="text-center">
                <div className="font-mono text-2xl font-bold">
                  {summaryStats.totalDeposits}
                </div>
                <div className="font-mono text-sm text-gray-600">
                  Total Deposits
                </div>
              </div>
              <div className="text-center">
                <div className="font-mono text-2xl font-bold">
                  {summaryStats.totalValue}
                </div>
                <div className="font-mono text-sm text-gray-600">
                  Total Value
                </div>
              </div>
              <div className="text-center">
                <div className="font-mono text-2xl font-bold">
                  {summaryStats.successRate}
                </div>
                <div className="font-mono text-sm text-gray-600">
                  Success Rate
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* History Cards - Stacked Vertically */}
        {historyLoading ? (
          <div className="space-y-3 xs:space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <HistoryCardSkeleton key={index} />
            ))}
          </div>
        ) : history && history.length > 0 ? (
          <div className="space-y-3 xs:space-y-4">
            {currentItems.map((transaction, index) => (
              <HistoryCard
                key={transaction.deposit_id}
                data={transaction}
                onClick={() => handleCardClick(transaction)}
                effectiveStatus={getEffectiveStatus(transaction)}
              />
            ))}
          </div>
        ) : (
          <Card className="p-6 xs:p-8 text-center">
            <p className="font-mono text-sm xs:text-base text-gray-600">
              No transaction history found.
            </p>
          </Card>
        )}

        {/* Pagination */}
        {history && history.length > 0 && totalPages > 1 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
        )}
      </div>

      <DepositStatus
        isOpen={isStatusOpen}
        onClose={handleCloseStatus}
        swapState={swapState}
        depositStatus={selectedCardStatus}
        selectedAsset={selectedDeposit ? { symbol: "Asset" } : null}
        isInitializing={false}
        isSwapping={false}
      />
    </div>
  );
};

export default HistoryPage;
