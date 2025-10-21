use axum::{Json, http::StatusCode, response::IntoResponse, response::Response as AxumResponse};
use bigdecimal::BigDecimal;
use serde::{Deserialize, Serialize};

/// Status of an API response
///
/// Used to indicate whether an API call was successful or encountered an error.
/// This is included as a top-level field in every response.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum Status {
    /// Operation completed successfully
    Ok,
    /// Operation encountered an error
    Error,
}

/// Standard API response wrapper
///
/// This structure wraps all API responses to provide a consistent format:
/// - `status`: Indicates if the request was successful or encountered an error
/// - `data`: Contains the actual response data when successful
/// - `error`: Contains error details when the request fails
///
/// # Examples
///
/// ```
/// # use crate::api::primitives::{Response, Status};
/// let success = Response::ok("success data");
/// let error = Response::<()>::error("something went wrong");
/// ```
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Response<T> {
    /// Status of the response (Ok or Error)
    pub status: Status,

    /// The response payload when status is Ok
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<T>,

    /// Error details when status is Error
    /// Only present when an error occurs
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,

    /// The status code of the response
    #[serde(skip)]
    pub status_code: StatusCode,
}

impl<T> Response<T> {
    /// Creates a successful response with the given data
    ///
    /// # Arguments
    ///
    /// * `data` - The data to include in the successful response
    ///
    /// # Returns
    ///
    /// A JSON-wrapped Response with Ok status and the provided data
    pub fn ok(data: T) -> Self {
        Self {
            status: Status::Ok,
            result: Some(data),
            error: None,
            status_code: StatusCode::OK,
        }
    }

    /// Creates an error response with the given error message
    ///
    /// # Arguments
    ///
    /// * `error` - Any type that can be converted to a String
    ///
    /// # Returns
    ///
    /// A JSON-wrapped Response with Error status and the provided error message
    pub fn error<E: ToString>(error: E, status_code: StatusCode) -> Self {
        Self {
            status: Status::Error,
            error: Some(error.to_string()),
            result: None,
            status_code,
        }
    }
}

impl<T> IntoResponse for Response<T>
where
    T: serde::Serialize,
{
    fn into_response(self) -> AxumResponse {
        let status_code = self.status_code;
        let mut response = Json(self).into_response();
        *response.status_mut() = status_code;
        response
    }
}

/// Type alias for API result (success or error)
pub type ApiResult<T> = Result<Response<T>, Response<()>>;

/// Represents a supported asset with its metadata and identifiers.
#[derive(Serialize, Deserialize)]
pub struct Asset {
    /// The display name of the asset (e.g., "Ether").
    pub name: String,
    /// The ticker symbol of the asset (e.g., "ETH").
    pub symbol: String,
    /// The number of decimals the asset uses.
    pub decimals: u8,
    /// The Coingecko ID for price lookup.
    pub coingecko_id: String,
    /// The on-chain address of the asset.
    pub address: String,
    /// The price of the asset.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub price: Option<BigDecimal>,
}

/// Status of a deposit operation
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, sqlx::Type)]
#[sqlx(type_name = "text", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum DepositStatus {
    /// Initial state when deposit is created
    Created,
    /// User has initiated the deposit transaction
    Initiated,
    /// Deposit has been confirmed on-chain
    Deposited,
}

impl std::fmt::Display for DepositStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DepositStatus::Created => write!(f, "created"),
            DepositStatus::Initiated => write!(f, "initiated"),
            DepositStatus::Deposited => write!(f, "deposited"),
        }
    }
}

/// Request to create a new deposit
#[derive(Debug, Deserialize)]
pub struct CreateDepositRequest {
    /// User's wallet address (hex string)
    pub user_address: String,
    /// Action type identifier
    pub action: u128,
    /// Deposit amount
    pub amount: BigDecimal,
    /// Token contract address (hex string)
    pub token: String,
    /// Target address for the deposit (hex string)
    pub target_address: String,
}

/// Response containing deposit details
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DepositResponse {
    /// Unique deposit identifier (32 bytes as hex string)
    pub deposit_id: String,
    /// User's wallet address
    pub user_address: String,
    /// Action type identifier
    #[sqlx(try_from = "i64")]
    pub action: u128,
    /// Deposit amount
    #[serde(serialize_with = "serialize_bigdecimal_as_string")]
    pub amount: BigDecimal,
    /// Token contract address
    pub token: String,
    /// Target address for the deposit
    pub target_address: String,
    /// Generated deposit address from registry
    pub deposit_address: String,
    /// Current status of the deposit
    pub status: DepositStatus,
    /// Timestamp when deposit was created
    #[sqlx(rename = "created_at")]
    pub created_at: chrono::DateTime<chrono::Utc>,
    /// Transaction hash of the deposit
    pub deposit_tx_hash: Option<String>,
    /// Bitcoin transaction hash
    pub btc_tx_hash: Option<String>,
    /// Atomiq swap id
    pub atomiq_swap_id: Option<String>,
}

/// Custom serializer for BigDecimal to ensure it's serialized as a plain string
fn serialize_bigdecimal_as_string<S>(value: &BigDecimal, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_str(&value.to_string())
}
