/**
 * Vesu API Response Types
 */

export interface VesuPool {
  pool_id: string;
  name?: string;
  total_supplied: string;
  total_borrowed: string;
  supply_apr: string;
  borrow_apr: string;
  utilization: string;
  collateral_assets?: VesuCollateralAsset[];
  debt_assets?: VesuDebtAsset[];
  [key: string]: any; // Allow additional fields from API
}

export interface VesuCollateralAsset {
  asset_address: string;
  symbol: string;
  amount: string;
  value_usd?: string;
  icon_url?: string;
}

export interface VesuDebtAsset {
  asset_address: string;
  symbol: string;
  amount: string;
  value_usd?: string;
  icon_url?: string;
}

export interface VesuPosition {
  pool_id: string;
  pool_name?: string;
  user_address: string;
  collateral: VesuCollateralAsset[];
  debt: VesuDebtAsset[];
  health_factor?: string;
  net_value_usd?: string;
  [key: string]: any;
}

// New API response format for positions
export interface VesuPositionResponse {
  collateral: {
    address: string;
    decimals: number;
    name: string;
    symbol: string;
    usdPrice: {
      decimals: number;
      value: string;
    };
    value: string;
  };
  collateralShares: {
    address: string;
    decimals: number;
    name: string;
    symbol: string;
    value: string;
  };
  isDeprecated: boolean;
  pool: {
    extensionContractAddress: string;
    id: string;
    name: string;
  };
  type: string;
  walletAddress: string;
}

export interface VesuPositionsApiResponse {
  status: string;
  result: VesuPositionResponse[];
}

// New API response format for history
export interface VesuHistoryResponse {
  deposit_id: string;
  user_address: string;
  action: number;
  amount: string;
  token: string;
  target_address: string;
  deposit_address: string;
  status: "created" | "initiated" | "deposited";
  created_at: string;
  deposit_tx_hash: string | null;
  btc_tx_hash: string | null;
  atomiq_swap_id: string | null;
}

export interface VesuHistoryApiResponse {
  status: string;
  result: VesuHistoryResponse[];
}

export interface VesuTransaction {
  transaction_hash: string;
  timestamp: string;
  type: "supply" | "withdraw" | "borrow" | "repay" | "liquidate";
  pool_id?: string;
  asset_address: string;
  asset_symbol?: string;
  amount: string;
  value_usd?: string;
  [key: string]: any;
}

export interface VesuUserHistory {
  user_address: string;
  transactions: VesuTransaction[];
  total_supplied?: string;
  total_borrowed?: string;
  total_value_usd?: string;
  [key: string]: any;
}

/**
 * Asset types
 */
export interface Asset {
  name: string;
  symbol: string;
  decimals: number;
  coingecko_id: string;
  address: string;
  price?: string;
  icon_url?: string;
}

/**
 * Deposit types
 */
export interface Deposit {
  deposit_id: string;
  user_address: string;
  action: number;
  amount: string;
  token: string;
  target_address: string;
  deposit_address: string;
  status: "created" | "initiated" | "deposited";
  created_at: string;
}
