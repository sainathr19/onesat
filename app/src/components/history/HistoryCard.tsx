"use client";

import React from "react";
import { VesuHistoryResponse } from "@/types/vesu";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { PROJECTS } from "@/types/earn";

interface HistoryCardProps {
  data: VesuHistoryResponse;
  className?: string;
  onClick?: () => void;
  effectiveStatus?: string;
}

const EXPLORERS = {
  starknet: {
    tx: (hash: string) => `https://sepolia.starkscan.co/tx/${hash}`,
    address: (address: string) => `https://sepolia.starkscan.co/contract/${address}`,
  },
  bitcoin: {
    tx: (hash: string) => `https://blockstream.info/testnet/tx/${hash}`,
    address: (address: string) => `https://blockstream.info/testnet/address/${address}`,
  }
};

const HistoryCard: React.FC<HistoryCardProps> = ({ data, className, onClick, effectiveStatus: propEffectiveStatus }) => {
  const isExpired = () => {
    // If parent already determined it's expired, use that
    if (propEffectiveStatus === "expired") return true;

    // Otherwise check locally (fallback)
    if (!propEffectiveStatus || propEffectiveStatus !== "created") return false;
    if (!data.created_at) return false;
    // Only expire if there's no BTC tx hash (truly created, not initiated)
    if (data.btc_tx_hash) return false;
    const now = new Date();
    const createdAt = new Date(data.created_at);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours
    return createdAt < twoHoursAgo;
  };

  const expired = isExpired();

  const formatTimestamp = (timestamp: string) => {
    if (!timestamp) return "N/A";
    const date = new Date(timestamp);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString();
  };

  const formatAmount = (value: string) => {
    if (!value) return "0";
    const num = parseFloat(value);

    if (num < 0.01) {
      return num.toFixed(8);
    } else if (num < 1) {
      return num.toFixed(6);
    } else if (num < 10) {
      return num.toFixed(4);
    } else {
      return num.toFixed(2);
    }
  };

  // Format address to show first 4 and last 4 characters
  const formatAddress = (address: string) => {
    if (!address) return "";
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };


  // BTC transaction hash comes from backend now (used in render below)
  const btcTxId = data.btc_tx_hash;

  // Compute effective status for display based on available data
  const effectiveStatus = (() => {
    // Use prop status if provided (from parent cache)
    if (propEffectiveStatus) return propEffectiveStatus;

    if (expired) return "expired";
    // Backend btc_tx_hash takes precedence
    return data.status || "unknown";
  })();

  // Get status color
  const getStatusColor = (status: string) => {
    if (status === "expired") return "bg-red-500";
    switch (status) {
      case "created":
        return "bg-yellow-500";
      case "checking":
        return "bg-orange-500";
      case "initiated":
        return "bg-blue-500";
      case "redeemed":
        return "bg-green-500";
      case "deposited":
        return "bg-primary";
      default:
        return "bg-my-grey";
    }
  };

  // Get display status
  const getDisplayStatus = () => {
    if (effectiveStatus === "expired") return "Expired";
    const s = effectiveStatus || "unknown";
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  // Button is disabled only for expired transactions
  const isButtonDisabled = expired;

  // Utility for links and fallback
  const renderLinkedOrRaw = (
    value?: string | null,
    explorer?: (id: string) => string
  ) => {
    if (!value) return <span className="text-gray-500">N/A</span>;
    return explorer ? (
      <a
        href={explorer(value)}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-sm font-medium underline hover:text-blue-600"
      >
        {formatAddress(value)}
      </a>
    ) : (
      <span className="font-mono text-sm font-medium">{formatAddress(value)}</span>
    );
  };

  // For Bitcoin addresses vs Starknet addresses
  // Assume: addresses with "bc1", "tb1", or length 42 (0x...) are Bitcoin or Starknet respectively
  const isBitcoinAddress = (addr: string) =>
    addr && (addr.startsWith("tb1") || addr.startsWith("bc1") || /^[13mn]/.test(addr));
  const isStarknetAddress = (addr: string) =>
    addr && addr.startsWith("0x") && addr.length === 66;

  // Detect explorer
  const explorerForAddress = (addr: string) => {
    if (isBitcoinAddress(addr)) return EXPLORERS.bitcoin.address;
    if (isStarknetAddress(addr)) return EXPLORERS.starknet.address;
    return undefined;
  };

  // Detect explorer for tx hash
  // We will explicitly choose BTC explorer for BTC tx sourced from local store
  const explorerForTxHash = (hash: string) =>
    hash && hash.startsWith("0x")
      ? EXPLORERS.starknet.tx
      : EXPLORERS.bitcoin.tx;

  const amount = formatAmount(data.amount);
  const formattedTimestamp = formatTimestamp(data.created_at);

  const handleStatusClick = () => {
    console.log("Status button clicked, isButtonDisabled:", isButtonDisabled, "onClick:", !!onClick);
    if (!isButtonDisabled && onClick) {
      onClick();
    }
  };

  return (
    <Card willHover={false} className={cn("space-y-4 xs:space-y-6 w-full", className)}>
      {/* Header */}
      <div className="flex flex-col xs:flex-row items-start xs:items-center justify-between gap-3 xs:gap-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 xs:gap-3">
            <div className="w-6 h-6 xs:w-7 xs:h-7 flex items-center justify-center bg-my-grey">
              <Image
                src={PROJECTS.VESU.iconUrl}
                alt={`Vesu`}
                width={20}
                height={20}
                className="w-4 h-4 xs:w-5 xs:h-5"
              />
            </div>
          </div>
          <div className="flex items-center gap-1 xs:gap-2">
            <h3 className="font-semibold text-sm xs:text-base">Vesu</h3>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 ${getStatusColor(effectiveStatus)} rounded-full`}
          ></div>
          <span className="font-mono text-xs xs:text-sm">
            {getDisplayStatus()}
          </span>
        </div>
      </div>

      {/* Transaction Details - Mobile: Stacked, Tablet+: Grid */}
      <div className="space-y-3 xs:space-y-4">
        {/* Mobile Layout - All fields stacked */}
        <div className="flex flex-col gap-3 sm:hidden">
          <div className="space-y-1">
            <div className="font-mono text-xs xs:text-sm font-medium underline">
              {formattedTimestamp}
            </div>
            <div className="font-mono text-xs text-gray-600">Created At</div>
          </div>

          <div className="space-y-1">
            {data.deposit_tx_hash ? (
              renderLinkedOrRaw(
                data.deposit_tx_hash,
                explorerForTxHash(data.deposit_tx_hash)
              )
            ) : (
              <div className="font-mono text-xs xs:text-sm font-medium text-gray-500">
                {expired ? "Cancelled" : "Pending"}
              </div>
            )}
            <div className="font-mono text-xs text-gray-600">
              Deposit Txn Hash
            </div>
          </div>

          <div className="space-y-1">
            {renderLinkedOrRaw(
              data.token,
              data.token ? explorerForAddress(data.token) : undefined
            )}
            <div className="font-mono text-xs text-gray-600">Token Address</div>
          </div>

          <div className="space-y-1">
            {data.atomiq_swap_id ? (
              renderLinkedOrRaw(
                data.atomiq_swap_id,
                undefined
              )
            ) : (
              <span className="text-xs text-gray-500">N/A</span>
            )}
            <div className="font-mono text-xs text-gray-600">
              Atomiq Swap Id
            </div>
          </div>

          <div className="space-y-1">
            {renderLinkedOrRaw(
              data.target_address,
              data.target_address ? explorerForAddress(data.target_address) : undefined
            )}
            <div className="font-mono text-xs text-gray-600">
              Target Address
            </div>
          </div>

          <div className="space-y-1">
            {renderLinkedOrRaw(
              data.deposit_address,
              data.deposit_address ? explorerForAddress(data.deposit_address) : undefined
            )}
            <div className="font-mono text-xs text-gray-600">
              Deposit Address
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-my-grey/20">
            <div className="space-y-1">
              <div className="font-mono text-base xs:text-lg font-medium">{amount}</div>
              <div className="font-mono text-xs text-gray-600">Amount</div>
            </div>
            <Button
              variant={isButtonDisabled ? "disabled" : "primary"}
              size="sm"
              disabled={isButtonDisabled}
              onClick={handleStatusClick}
              className="w-full"
            >
              Order Status
            </Button>
          </div>
        </div>

        {/* Tablet & Desktop Layout - Grid */}
        <div className="hidden sm:block">
          {/* Top Row - 3 columns */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 xs:gap-4 mb-3 xs:mb-4">
            <div className="space-y-1">
              <div className="font-mono text-xs xs:text-sm font-medium underline">
                {formattedTimestamp}
              </div>
              <div className="font-mono text-xs text-gray-600">Created At</div>
            </div>

            <div className="space-y-1">
              {data.deposit_tx_hash ? (
                renderLinkedOrRaw(
                  data.deposit_tx_hash,
                  explorerForTxHash(data.deposit_tx_hash)
                )
              ) : (
                <div className="font-mono text-xs xs:text-sm font-medium text-gray-500">
                  {expired ? "Cancelled" : "Pending"}
                </div>
              )}
              <div className="font-mono text-xs text-gray-600">
                Deposit Txn Hash
              </div>
            </div>

            <div className="space-y-1">
              {renderLinkedOrRaw(
                data.token,
                data.token ? explorerForAddress(data.token) : undefined
              )}
              <div className="font-mono text-xs text-gray-600">Token Address</div>
            </div>
          </div>

          {/* Bottom Row - 4 columns */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 xs:gap-4">
            <div className="space-y-1">
              {data.atomiq_swap_id ? (
                renderLinkedOrRaw(
                  data.atomiq_swap_id,
                  undefined
                )
              ) : (
                <span className="text-xs xs:text-sm text-gray-500">N/A</span>
              )}
              <div className="font-mono text-xs text-gray-600">
                Atomiq Swap Id
              </div>
            </div>

            <div className="space-y-1">
              {renderLinkedOrRaw(
                data.target_address,
                data.target_address ? explorerForAddress(data.target_address) : undefined
              )}
              <div className="font-mono text-xs text-gray-600">
                Target Address
              </div>
            </div>

            <div className="space-y-1">
              {renderLinkedOrRaw(
                data.deposit_address,
                data.deposit_address ? explorerForAddress(data.deposit_address) : undefined
              )}
              <div className="font-mono text-xs text-gray-600">
                Deposit Address
              </div>
            </div>

            <div className="space-y-2 xs:space-y-3 text-left md:text-right">
              <div className="space-y-1">
                <div className="font-mono text-base xs:text-lg font-medium">{amount}</div>
                <div className="font-mono text-xs text-gray-600">Amount</div>
              </div>
              <Button
                variant={isButtonDisabled ? "disabled" : "primary"}
                size="sm"
                disabled={isButtonDisabled}
                onClick={handleStatusClick}
                className="w-full"
              >
                Order Status
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default HistoryCard;
