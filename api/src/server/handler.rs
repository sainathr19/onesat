use std::{str::FromStr, sync::Arc};

use axum::extract::{Json, Path, Query, State};
use bigdecimal::BigDecimal;
use reqwest::StatusCode;
use serde::Deserialize;
use serde_json::Value;
use starknet::core::types::Felt;

use crate::{
    coingecko::CoingeckoFiatProvider,
    orderbook::OrderbookProvider,
    primitives::{ApiResult, Asset, CreateDepositRequest, DepositResponse, Response},
    registry::VaultRegistry,
};

pub struct HandlerState {
    pub coingecko: Arc<CoingeckoFiatProvider>,
    pub supported_assets: Vec<Asset>,
    pub vesu_api_base_url: String,
    pub vault_registry: Arc<VaultRegistry>,
    pub orderbook: Arc<OrderbookProvider>,
}

/// Health check endpoint that returns the service status
///
/// # Returns
/// * A static string indicating the service is online
pub async fn get_health() -> &'static str {
    "Online"
}

pub async fn supported_assets(State(state): State<Arc<HandlerState>>) -> ApiResult<Vec<Asset>> {
    let prices = state
        .coingecko
        .get_all_prices()
        .await
        .map_err(|e| Response::error(e.to_string(), StatusCode::INTERNAL_SERVER_ERROR))?;
    let supported_assets = state
        .supported_assets
        .iter()
        .map(|asset| {
            let price = match prices.get(asset.coingecko_id.as_str()) {
                Some(price) => Some(price.clone()),
                None => None,
            };
            Asset {
                name: asset.name.clone(),
                symbol: asset.symbol.clone(),
                decimals: asset.decimals,
                coingecko_id: asset.coingecko_id.clone(),
                address: asset.address.clone(),
                price: price,
            }
        })
        .collect();
    Ok(Response::ok(supported_assets))
}

#[derive(Deserialize)]
pub struct VesuPositionsQuery {
    #[serde(rename = "walletAddress")]
    pub wallet_address: String,
}

#[derive(Deserialize)]
pub struct VesuPositionsResponse {
    pub data: Value,
}

pub async fn vesu_positions(
    Query(query): Query<VesuPositionsQuery>,
    State(state): State<Arc<HandlerState>>,
) -> ApiResult<Value> {
    let url = format!("{}/positions", state.vesu_api_base_url);
    let client = reqwest::Client::new();
    let response = client
        .get(url)
        .query(&[("walletAddress", query.wallet_address)])
        .send()
        .await
        .map_err(|e| Response::error(e.to_string(), StatusCode::INTERNAL_SERVER_ERROR))?;
    let body = response
        .text()
        .await
        .map_err(|e| Response::error(e.to_string(), StatusCode::INTERNAL_SERVER_ERROR))?;
    let data: VesuPositionsResponse = serde_json::from_str(&body)
        .map_err(|e| Response::error(e.to_string(), StatusCode::INTERNAL_SERVER_ERROR))?;
    Ok(Response::ok(data.data))
}

pub async fn vesu_history(
    Query(query): Query<VesuPositionsQuery>,
    State(state): State<Arc<HandlerState>>,
) -> ApiResult<Value> {
    let url = format!(
        "{}/users/{}/history",
        state.vesu_api_base_url, query.wallet_address
    );
    let client = reqwest::Client::new();
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| Response::error(e.to_string(), StatusCode::INTERNAL_SERVER_ERROR))?;
    let body = response
        .text()
        .await
        .map_err(|e| Response::error(e.to_string(), StatusCode::INTERNAL_SERVER_ERROR))?;
    let data: VesuPositionsResponse = serde_json::from_str(&body)
        .map_err(|e| Response::error(e.to_string(), StatusCode::INTERNAL_SERVER_ERROR))?;
    Ok(Response::ok(data.data))
}

#[derive(Deserialize)]
pub struct VesuPoolsQuery {
    #[serde(rename = "poolAddress")]
    pub pool_address: Option<String>,
}

pub async fn vesu_pools(
    Query(query): Query<VesuPoolsQuery>,
    State(state): State<Arc<HandlerState>>,
) -> ApiResult<Value> {
    let url = match query.pool_address {
        Some(pool_address) => format!("{}/pools/{}", state.vesu_api_base_url, pool_address),
        None => format!("{}/pools", state.vesu_api_base_url),
    };
    let client = reqwest::Client::new();
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| Response::error(e.to_string(), StatusCode::INTERNAL_SERVER_ERROR))?;
    let body = response
        .text()
        .await
        .map_err(|e| Response::error(e.to_string(), StatusCode::INTERNAL_SERVER_ERROR))?;
    let data: VesuPositionsResponse = serde_json::from_str(&body)
        .map_err(|e| Response::error(e.to_string(), StatusCode::INTERNAL_SERVER_ERROR))?;
    Ok(Response::ok(data.data))
}

/// Creates a new deposit and returns the deposit details
///
/// This endpoint:
/// 1. Validates the request parameters
/// 2. Calls the registry contract to predict the deposit address
/// 3. Generates a unique 32-byte deposit ID
/// 4. Stores the deposit in the database with status "created"
/// 5. Returns all deposit information
pub async fn create_deposit(
    State(state): State<Arc<HandlerState>>,
    Json(request): Json<CreateDepositRequest>,
) -> ApiResult<DepositResponse> {
    // Validate and parse Felt addresses
    let user_address = Felt::from_hex(&request.user_address).map_err(|e| {
        Response::error(
            format!("Invalid user_address: {}", e),
            StatusCode::BAD_REQUEST,
        )
    })?;

    let token = Felt::from_hex(&request.token).map_err(|e| {
        Response::error(
            format!("Invalid token address: {}", e),
            StatusCode::BAD_REQUEST,
        )
    })?;

    let target_address = Felt::from_hex(&request.target_address).map_err(|e| {
        Response::error(
            format!("Invalid target_address: {}", e),
            StatusCode::BAD_REQUEST,
        )
    })?;

    // Validate amount is positive
    let zero = BigDecimal::from_str("0").unwrap();
    if request.amount <= zero {
        return Err(Response::error(
            "Amount must be positive",
            StatusCode::BAD_REQUEST,
        ));
    }

    // Generate random 32-byte deposit ID and encode as hex
    let deposit_id_bytes: [u8; 32] = rand::random();
    let deposit_id = hex::encode(deposit_id_bytes);

    let deposit_id_felt = Felt::from_hex(&deposit_id).map_err(|e| {
        Response::error(
            format!("Invalid deposit_id: {}", e),
            StatusCode::BAD_REQUEST,
        )
    })?;

    // Call registry contract to predict deposit address
    let deposit_address_felt = state
        .vault_registry
        .predict_address(
            &user_address,
            &deposit_id_felt,
            request.action,
            &request.amount,
            &token,
            &target_address,
        )
        .await
        .map_err(|e| {
            Response::error(
                format!("Failed to predict deposit address: {}", e),
                StatusCode::INTERNAL_SERVER_ERROR,
            )
        })?;

    let deposit_address = format!("{:#x}", deposit_address_felt);

    // Insert into database
    let deposit = state
        .orderbook
        .create_deposit(
            &deposit_id,
            &request.user_address,
            request.action,
            &request.amount,
            &request.token,
            &request.target_address,
            &deposit_address,
            None,
            None,
        )
        .await
        .map_err(|e| {
            Response::error(
                format!("Database error: {}", e),
                StatusCode::INTERNAL_SERVER_ERROR,
            )
        })?;

    Ok(Response::ok(deposit))
}

/// Retrieves a specific deposit by its ID
///
/// # Path Parameters
/// * `deposit_id` - The 32-byte deposit ID as a hex string
///
/// # Returns
/// The deposit details if found, or a 404 error if not found
pub async fn get_deposit(
    State(state): State<Arc<HandlerState>>,
    Path(deposit_id): Path<String>,
) -> ApiResult<DepositResponse> {
    let deposit = state
        .orderbook
        .get_deposit(&deposit_id)
        .await
        .map_err(|e| {
            Response::error(
                format!("Database error: {}", e),
                StatusCode::INTERNAL_SERVER_ERROR,
            )
        })?;

    match deposit {
        Some(deposit) => Ok(Response::ok(deposit)),
        None => Err(Response::error("Deposit not found", StatusCode::NOT_FOUND)),
    }
}

/// Retrieves all deposits with "created" status
///
/// # Returns
/// A list of all deposits that have status "created"
pub async fn get_created_deposits(
    State(state): State<Arc<HandlerState>>,
) -> ApiResult<Vec<DepositResponse>> {
    let deposits = state
        .orderbook
        .get_deposits_by_status("created")
        .await
        .map_err(|e| {
            Response::error(
                format!("Database error: {}", e),
                StatusCode::INTERNAL_SERVER_ERROR,
            )
        })?;

    Ok(Response::ok(deposits))
}

/// Retrieves all deposits for a specific user
///
/// # Path Parameters
/// * `user_address` - The user's wallet address
///
/// # Returns
/// A list of all deposits for the user
pub async fn get_user_deposits(
    State(state): State<Arc<HandlerState>>,
    Path(user_address): Path<String>,
) -> ApiResult<Vec<DepositResponse>> {
    let deposits = state
        .orderbook
        .get_deposits_by_user_address(&user_address)
        .await
        .map_err(|e| {
            Response::error(
                format!("Database error: {}", e),
                StatusCode::INTERNAL_SERVER_ERROR,
            )
        })?;
    Ok(Response::ok(deposits))
}

#[derive(Deserialize)]
pub struct UpdateAtomiqSwapIdRequest {
    pub atomiq_swap_id: String,
}

/// Updates the atomiq swap id for a deposit
///
/// # Path Parameters
/// * `deposit_id` - The deposit ID
///
/// # Returns
/// Result indicating success or failure
///
/// # Request Body
/// * `atomiq_swap_id` - The atomiq swap id to set
pub async fn update_atomiq_swap_id(
    State(state): State<Arc<HandlerState>>,
    Path(deposit_id): Path<String>,
    Json(request): Json<UpdateAtomiqSwapIdRequest>,
) -> ApiResult<()> {
    state
        .orderbook
        .update_atomiq_swap_id(&deposit_id, &request.atomiq_swap_id)
        .await
        .map_err(|e| {
            Response::error(
                format!("Database error: {}", e),
                StatusCode::INTERNAL_SERVER_ERROR,
            )
        })?;
    Ok(Response::ok(()))
}

#[derive(Deserialize)]
pub struct UpdateBtcTxHashRequest {
    pub btc_tx_hash: String,
}

/// Updates the BTC transaction hash for a deposit
///
/// # Path Parameters
/// * `deposit_id` - The deposit ID
///
/// # Returns
/// Result indicating success or failure
///
/// # Request Body
/// * `btc_tx_hash` - The Bitcoin transaction hash to set
pub async fn update_btc_tx_hash(
    State(state): State<Arc<HandlerState>>,
    Path(deposit_id): Path<String>,
    Json(request): Json<UpdateBtcTxHashRequest>,
) -> ApiResult<()> {
    state
        .orderbook
        .update_btc_tx_hash(&deposit_id, &request.btc_tx_hash)
        .await
        .map_err(|e| {
            Response::error(
                format!("Database error: {}", e),
                StatusCode::INTERNAL_SERVER_ERROR,
            )
        })?;
    Ok(Response::ok(()))
}
