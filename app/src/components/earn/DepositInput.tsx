"use client";

import { useState, useEffect, useMemo, useContext } from "react";
import { useRouter } from "next/navigation";
import Card from "../ui/Card";
import Image from "next/image";
import Button from "../ui/Button";
import { DepositStatus } from "../history/DepositStatus";
import { AssetSelectorModal } from "./AssetSelectorModal";
import { BitcoinNetwork, SwapperFactory } from "@atomiqlabs/sdk";
import {
  RpcProviderWithRetries,
  StarknetInitializer,
  StarknetInitializerType,
} from "@atomiqlabs/chain-starknet";
import { ChainDataContext } from "@/app/context/ChainDataContext";
import { useWallet } from "@/store/useWallet";
import { depositAPI, assetAPI } from "@/lib/api";
import { getTokenImageUrl } from "@/lib/earnUtils";

// Patch fetch for CORS
if (typeof window !== "undefined") {
  const originalFetch = window.fetch;
  window.fetch = function (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (url.includes("mempool.space")) {
      const proxiedUrl = url.replace("https://mempool.space", "/api/mempool");
      return originalFetch(proxiedUrl, init);
    }
    if (url.includes("okx.com")) {
      const proxiedUrl = url.replace("https://www.okx.com", "/api/okx");
      return originalFetch(proxiedUrl, init);
    }
    return originalFetch(input, init);
  };
}

const factory = new SwapperFactory<[StarknetInitializerType]>([
  StarknetInitializer,
]);
const Tokens = factory.Tokens;

interface DepositInputProps {
  poolData?: any;
}

export const DepositInput = ({ poolData }: DepositInputProps) => {
  const router = useRouter();
  const chainData = useContext(ChainDataContext);
  const bitcoinChainData = chainData.BITCOIN;
  const starknetChainData = chainData.STARKNET;

  const {
    bitcoinPaymentAddress,
    starknetAddress,
    connected,
    pendingDeposits,
    addPendingDeposit,
    updatePendingDeposit,
    removePendingDeposit,
    fetchPendingDeposits
  } = useWallet();

  const [amountBtc, setAmountBtc] = useState<string>("");
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(false);
  const [isSwapping, setIsSwapping] = useState<boolean>(false);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [quote, setQuote] = useState<any>(null);
  const [quoteAmount, setQuoteAmount] = useState<number>(0);
  const [isGettingQuote, setIsGettingQuote] = useState(false);
  const [btcPrice, setBtcPrice] = useState<number>(50000);
  const [currentDepositId, setCurrentDepositId] = useState<string | null>(null);
  const [depositStatus, setDepositStatus] = useState<string | null>(null);
  const [swapState, setSwapState] = useState<number>(0);
  const [btcBalance, setBtcBalance] = useState<number | null>(null);

  const starknetRpcUrl = "https://starknet-sepolia.public.blastapi.io/rpc/v0_8";
  const btcNetwork = BitcoinNetwork.TESTNET4;

  // Get collateral assets from pool data
  const collateralAssets = poolData?.assets || [];
  const poolId = poolData?.id || poolData?.poolId;

  // Initialize swapper
  const swapper = useMemo(() => {
    const rpc = new RpcProviderWithRetries({ nodeUrl: starknetRpcUrl });
    return factory.newSwapper({
      chains: { STARKNET: { rpcUrl: rpc } },
      bitcoinNetwork: btcNetwork,
    });
  }, [btcNetwork, starknetRpcUrl]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsInitializing(true);
      try {
        await swapper.init();
        if (!cancelled) console.log("🚀 ===== SWAPPER INITIALIZED =====");
      } catch (e: any) {
        if (!cancelled)
          console.error(
            "❌ ===== SWAPPER INITIALIZATION FAILED =====",
            e?.message
          );
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    })();
    return () => {
      cancelled = true;
      void swapper.stop();
    };
  }, [swapper]);

  // Fetch BTC price from assets API
  useEffect(() => {
    const fetchBtcPrice = async () => {
      try {
        const assets = await assetAPI.getAssets();
        // Find BTC asset (wrapped-bitcoin or bitcoin)
        const btcAsset = assets.find(
          (asset: any) =>
            asset.coingeckoId === "bitcoin" ||
            asset.coingeckoId === "wrapped-bitcoin" ||
            asset.symbol === "BTC" ||
            asset.symbol === "WBTC"
        );

        setBtcPrice(btcAsset.price);
      } catch (e: any) {
        console.error("Failed to fetch BTC price:", e?.message);
      }
    };

    fetchBtcPrice();
    // Refresh price every 30 seconds
    const interval = setInterval(fetchBtcPrice, 30000);
    return () => clearInterval(interval);
  }, []);

  // Set default asset to first one
  useEffect(() => {
    if (collateralAssets.length > 0 && !selectedAsset) {
      setSelectedAsset(collateralAssets[0]);
    }
  }, [collateralAssets]);

  // Fetch pending deposits on mount if connected
  useEffect(() => {
    if (connected && starknetAddress) {
      fetchPendingDeposits();
    }
  }, [connected, starknetAddress]);

  // Restore from Zustand store on mount
  useEffect(() => {
    if (!poolId || isInitializing || collateralAssets.length === 0) return;

    // Find pending deposit for this pool
    const pendingDeposit = pendingDeposits.find(
      (deposit) => deposit.poolId === poolId || deposit.targetAddress === poolId
    );

    if (pendingDeposit) {
      setCurrentDepositId(pendingDeposit.depositId);

      // Restore selected asset
      const restoredAsset = collateralAssets.find(
        (asset: any) => asset.address === pendingDeposit.token
      );
      if (restoredAsset) {
        setSelectedAsset(restoredAsset);
      }

      // Try to restore swap state from Atomiq SDK
      const swapId = pendingDeposit.swapId;
      if (swapId) {
        (async () => {
          try {
            const swap = await swapper.getSwapById(swapId);
            if (swap) {
              const state = swap.getState();
              setSwapState(state);

              // Listen to swap state changes
              swap.events.on("swapState", (updatedSwap) => {
                const newState = updatedSwap.getState();
                setSwapState(newState);
              });
            }
          } catch (e) {
            console.error("Failed to restore swap:", e);
          }
        })();
      }
    }
  }, [poolId, isInitializing, collateralAssets, swapper, pendingDeposits]);

  useEffect(() => {
    const fetchBtcBalance = async () => {
      if (!bitcoinPaymentAddress) return;

      try {
        const res = await fetch(
          `https://mempool.space/testnet4/api/address/${bitcoinPaymentAddress}`
        );
        const data = await res.json();

        const balanceInSats =
          data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum;

        const balanceInBtc = balanceInSats / 1e8;
        setBtcBalance(balanceInBtc);
      } catch (e) {
        console.error("Failed to fetch BTC balance:", e);
        setBtcBalance(null);
      }
    };

    fetchBtcBalance();
    const interval = setInterval(fetchBtcBalance, 30000);
    return () => clearInterval(interval);
  }, [bitcoinPaymentAddress]);

  // Poll deposit status
  useEffect(() => {
    if (!currentDepositId || depositStatus === "deposited") {
      return;
    }

    const pollDepositStatus = async () => {
      try {
        const result = await depositAPI.getDeposit(currentDepositId);
        setDepositStatus(result.status);

        if (result.status === "deposited") {
          // Reset when completed
          setCurrentDepositId(null);
          setSwapState(0);

          // Remove from Zustand store
          removePendingDeposit(currentDepositId);
        } else {
          // Update pending deposit status in store
          updatePendingDeposit(currentDepositId, {
            status: result.status,
            depositTxHash: result.deposit_tx_hash,
            atomiqSwapId: result.atomiq_swap_id,
          });
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
  }, [currentDepositId, depositStatus]);

  // Get quote when amount or asset changes
  useEffect(() => {
    // Clear quote if amount is empty or conditions not met
    if (!amountBtc || !selectedAsset || isInitializing || !connected) {
      setQuote(null);
      setIsGettingQuote(false);
      return;
    }

    const getQuote = async () => {
      try {
        setIsGettingQuote(true);
        const amountInSats = BigInt(Math.floor(Number(amountBtc) * 1e8));

        // Map asset symbol to Atomiq token
        let token;
        if (selectedAsset.symbol === "WBTC") {
          token = Tokens.STARKNET._TESTNET_WBTC_VESU;
        } else if (selectedAsset.symbol === "STRK") {
          token = Tokens.STARKNET.STRK;
        } else {
          token = Tokens.STARKNET.ETH;
        }

        const quoteData = await swapper.swap(
          Tokens.BITCOIN.BTC,
          token,
          amountInSats,
          true,
          bitcoinPaymentAddress!,
          starknetAddress!,
          {}
        );

        setQuote(quoteData);
        setQuoteAmount(
          Number(quoteData.getOutput().amount) * 10 ** token.decimals
        );
      } catch (e: any) {
        console.error("Failed to get quote:", e?.message);
        setQuote(null);
      } finally {
        setIsGettingQuote(false);
      }
    };

    const debounce = setTimeout(getQuote, 500);
    return () => clearTimeout(debounce);
  }, [
    amountBtc,
    selectedAsset,
    isInitializing,
    connected,
    bitcoinPaymentAddress,
    starknetAddress,
  ]);

  const handleStartEarning = async () => {
    if (!connected || !bitcoinPaymentAddress || !starknetAddress) {
      return;
    }

    // Check if wallet instances are properly available
    if (!bitcoinChainData?.wallet?.instance) {
      const reconnect = confirm(
        "Bitcoin wallet instance not available. Would you like to reconnect your Bitcoin wallet?"
      );
      if (reconnect && bitcoinChainData?.connect) {
        try {
          await bitcoinChainData.connect();
          // Wait a moment for the wallet to initialize
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
          console.error("Failed to reconnect Bitcoin wallet:", error);
        }
      }
      return;
    }

    if (!starknetChainData?.wallet?.instance) {
      const reconnect = confirm(
        "Starknet wallet instance not available. Would you like to reconnect your Starknet wallet?"
      );
      if (reconnect && starknetChainData?.connect) {
        try {
          await starknetChainData.connect();
          // Wait a moment for the wallet to initialize
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
          console.error("Failed to reconnect Starknet wallet:", error);
        }
      }
      return;
    }

    try {
      if (
        typeof bitcoinChainData.wallet.instance.getReceiveAddress !== "function"
      ) {
        return;
      }
    } catch (error) {
      return;
    }

    try {
      if (typeof starknetChainData.wallet.instance.getAddress !== "function") {
        return;
      }
    } catch (error) {
      return;
    }

    if (!amountBtc || !selectedAsset || !quote) {
      return;
    }

    try {
      setIsSwapping(true);
      setSwapState(0); // Reset swap state for new deposit

      const depositResult = await depositAPI.createDeposit({
        user_address: starknetAddress,
        action: 1,
        amount: quoteAmount.toString(),
        token: selectedAsset.address,
        target_address: selectedAsset.vToken.address,
      });

      // Get the deposit address from the response
      let depositAddress = depositResult.deposit_address;
      if (!depositAddress) {
        throw new Error("No deposit_address returned from API");
      }

      // Pad address to 66 characters (0x + 64 hex chars)
      if (depositAddress.startsWith("0x")) {
        const addressWithoutPrefix = depositAddress.slice(2);
        const paddedAddress = addressWithoutPrefix.padStart(64, "0");
        depositAddress = "0x" + paddedAddress;
      }

      setCurrentDepositId(depositResult.deposit_id);
      setDepositStatus("created");

      // Add to Zustand store
      addPendingDeposit({
        depositId: depositResult.deposit_id,
        swapId: null,
        poolId: poolId,
        selectedAsset: selectedAsset,
        createdAt: new Date().toISOString(),
        status: "created",
        depositAddress: depositAddress,
        amount: quoteAmount.toString(),
        token: selectedAsset.address,
        targetAddress: selectedAsset.vToken.address,
        depositTxHash: null,
        atomiqSwapId: null,
      });

      // Wait for a moment before proceeding
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Step 2: Create swap with deposit_address as destination
      const amountInSats = BigInt(Math.floor(Number(amountBtc) * 1e8));

      // Map asset symbol to Atomiq token
      let token;
      if (selectedAsset.symbol === "WBTC") {
        token = Tokens.STARKNET._TESTNET_WBTC_VESU;
      } else if (selectedAsset.symbol === "STRK") {
        token = Tokens.STARKNET.STRK;
      } else {
        token = Tokens.STARKNET.ETH;
      }

      const swap = await swapper.swap(
        Tokens.BITCOIN.BTC,
        token,
        amountInSats,
        true,
        bitcoinPaymentAddress,
        depositAddress, // Use deposit_address from API response
        {}
      );

      const swapId = swap.getId();

      const result = await depositAPI.updateAtomiqSwapId(depositResult.deposit_id, swapId);
      console.log("Result:", result);

      // Update Zustand store with swapId
      updatePendingDeposit(depositResult.deposit_id, {
        swapId: swapId,
        atomiqSwapId: swapId,
      });

      // Track swap state changes
      swap.events.on("swapState", (updatedSwap) => {
        const state = updatedSwap.getState();
        if (state > swapState) {
          setSwapState(state);
        }
      });

      // Patch wallet instance for compatibility
      const btcWallet = bitcoinChainData.wallet?.instance;
      if (btcWallet) {
        if (!(btcWallet as any).publicKey) {
          (btcWallet as any).publicKey = (btcWallet as any).pubkey;
        }
        if (!(btcWallet as any).getAccounts) {
          (btcWallet as any).getAccounts = () =>
            (btcWallet as any).toBitcoinWalletAccounts();
        }
      }

      // Step 3: Send Bitcoin transaction
      const txId = await swap.sendBitcoinTransaction(
        bitcoinChainData.wallet!.instance
      );

      console.log("🆔 Transaction ID:", txId);

      // Send BTC tx hash to backend
      try {
        await depositAPI.updateBtcTxHash(depositResult.deposit_id, txId);
      } catch (error) {
        console.error("Failed to update BTC tx hash:", error);
      }

      // Also update local store for immediate UI feedback
      updatePendingDeposit(depositResult.deposit_id, {
        depositTxHash: txId,
      });

      // Redirect to history page
      router.push("/history");

      // Step 4: Wait for confirmation with progress updates
      await swap.waitForBitcoinTransaction(
        undefined,
        2
      );

      setDepositStatus("deposited");
    } catch (e: any) {
      console.error("❌ Deposit failed:", e);
    } finally {
      setIsSwapping(false);
    }
  };

  const calculateEquivalent = () => {
    if (!quote || !selectedAsset || !amountBtc) return "0.00";
    const output = Number(quote.getOutput().amount);
    return output.toFixed(5);
  };

  const calculateFees = () => {
    if (!quote) return "$0.00";
    const feeData = quote.getFee();

    // Get fee amount in BTC (using _amount which is the decimal value)
    const feeBtc = feeData.amountInSrcToken._amount;
    const feeUsd = feeBtc * btcPrice;

    return `$${feeUsd.toFixed(2)}`;
  };

  const calculateMonthlyEarnings = () => {
    if (!selectedAsset || !amountBtc) return "$0.00";
    const supplyApr =
      selectedAsset.stats?.defiSpringSupplyApr?.value ||
      selectedAsset.stats?.supplyApy?.value ||
      "0";
    const aprValue = parseFloat(supplyApr) / Math.pow(10, 18);
    const monthlyRate = aprValue / 12;
    const btcAmount = parseFloat(amountBtc);
    const earnings = btcAmount * btcPrice * monthlyRate;
    return `$${earnings.toFixed(2)}`;
  };

  const calculateYearlyReturn = () => {
    const monthly = parseFloat(calculateMonthlyEarnings().replace("$", ""));
    return `$${(monthly * 12).toFixed(2)}`;
  };

  return (
    <>
      <Card
        isActive={false}
        willHover={false}
        className="text-left grid md:grid-cols-3 mt-6 xs:mt-8 md:mt-10 grid-cols-1 gap-6 xs:gap-7 md:gap-8"
      >
        <div className="flex flex-col items-center justify-center gap-2 xs:gap-2.5 w-full md:border-r border-b md:border-b-0 pb-6 xs:pb-7 md:pb-0 border-my-grey md:pr-6 xs:md:pr-7 md:pr-9">
          <div className="flex items-center justify-between w-full flex-wrap gap-2">
            <span className="text-base xs:text-lg">I want to deposit</span>
          </div>
          <div className="flex items-center justify-between w-full border-b border-my-grey pt-3 xs:pt-4">
            <input
              type="number"
              placeholder="0.0002"
              value={amountBtc}
              onChange={(e) => setAmountBtc(e.target.value)}
              className="text-[28px] xs:text-[32px] lg:text-[36px] font-medium bg-transparent focus:outline-none active:outline-none w-[70%]"
              step="0.00001"
            />
            <span className="flex items-center gap-1.5 xs:gap-2">
              <Image
                src="/BTCIon.svg"
                alt="BTC"
                width={32}
                height={32}
                className="w-6 h-6 xs:w-7 xs:h-7 md:w-8 md:h-8"
              />
              <p className="text-lg xs:text-xl md:text-2xl">BTC</p>
            </span>
          </div>
          <div className="flex items-center justify-between w-full text-xs xs:text-sm font-medium">
            <span>
              ≈ ${((parseFloat(amountBtc) || 0) * btcPrice).toFixed(2)}
            </span>
            <div className="flex items-center gap-1">
              <span className="font-normal">Balance: </span>
              <span>
                {btcBalance !== null ? `${btcBalance.toFixed(3)} BTC` : "--"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-2 xs:gap-2.5 w-full md:border-r border-b md:border-b-0 pb-6 xs:pb-7 md:pb-0 border-my-grey md:pr-6 xs:md:pr-7 md:pr-9 md:pl-5 xs:md:pl-6 md:pl-7">
          <div className="flex items-center justify-start w-full">
            <span className="text-base xs:text-lg text-nowrap">Equivalent to</span>
          </div>
          <div className="flex items-center justify-between w-full border-b border-my-grey pt-3 xs:pt-4">
            <span className="text-[28px] xs:text-[32px] lg:text-[36px] font-medium text-primary">
              {isGettingQuote ? "..." : calculateEquivalent()}
            </span>
            <button
              className="flex items-center gap-1.5 xs:gap-2 hover:opacity-80 transition-opacity"
              onClick={() => setShowAssetModal(true)}
            >
              <Image
                src={
                  selectedAsset
                    ? getTokenImageUrl(selectedAsset.symbol)
                    : getTokenImageUrl("wbtc")
                }
                alt={selectedAsset?.symbol || "Asset"}
                width={32}
                height={32}
                className="w-6 h-6 xs:w-7 xs:h-7 md:w-8 md:h-8"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/USDCIcon.svg";
                }}
              />
              <div className="flex flex-col items-start">
                <p className="text-base xs:text-lg font-medium">
                  {selectedAsset?.symbol || "Select"}
                </p>
              </div>
              <svg
                className="w-4 h-4 xs:w-5 xs:h-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          </div>
          <div className="flex items-center justify-start w-full text-xs xs:text-sm font-medium">
            <div className="flex items-center gap-1">
              <span className="font-normal">Fees: </span>
              <span>{calculateFees()}</span>
              <Image
                src="/icons/info.svg"
                alt="Info"
                width={12}
                height={12}
                className="w-2.5 h-2.5 xs:w-3 xs:h-3"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-2 xs:gap-2.5 w-full md:pl-5 xs:md:pl-6 md:pl-7">
          <div className="flex items-center justify-between w-full">
            <span className="text-base xs:text-lg text-nowrap">Monthly earnings</span>
            <span className="text-base xs:text-lg text-nowrap font-medium">
              {calculateMonthlyEarnings()}
            </span>
          </div>
          <div className="flex items-center justify-between w-full">
            <span className="text-base xs:text-lg text-nowrap">Est. 1 yr return</span>
            <span className="text-base xs:text-lg text-nowrap font-medium">
              {calculateYearlyReturn()}
            </span>
          </div>
          <Button
            variant="primary"
            willHover={true}
            className="w-full text-sm xs:text-base"
            onClick={() => {
              if (currentDepositId && depositStatus !== "deposited") {
                // Redirect to history page to view status
                router.push("/history");
              } else if (isInitializing || isSwapping) {
                // Redirect to history page during processing
                router.push("/history");
              } else {
                handleStartEarning();
              }
            }}
            disabled={
              !connected ||
              (isSwapping ||
                (!isInitializing &&
                  !currentDepositId &&
                  (!amountBtc || !selectedAsset)))
            }
          >
            {isSwapping
              ? "Processing..."
              : isInitializing
                ? "Initializing..."
                : currentDepositId && depositStatus !== "deposited"
                  ? "View Order Status"
                  : "Start Earning"}
          </Button>
        </div>
      </Card>

      {/* Asset Selector Modal */}
      <AssetSelectorModal
        isOpen={showAssetModal}
        onClose={() => setShowAssetModal(false)}
        assets={collateralAssets}
        selectedAsset={selectedAsset}
        onSelectAsset={setSelectedAsset}
      />
    </>
  );
};
