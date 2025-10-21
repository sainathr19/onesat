use std::{net::SocketAddr, sync::Arc};

use axum::{
    Router,
    http::Method,
    routing::{get, post},
};
use tower_http::cors::{AllowHeaders, Any, CorsLayer};
use tracing::info;

use crate::{
    coingecko::CoingeckoFiatProvider,
    orderbook::OrderbookProvider,
    primitives::Asset,
    registry::VaultRegistry,
    server::handler::{
        HandlerState, create_deposit, get_created_deposits, get_deposit, get_health,
        get_user_deposits, supported_assets, update_atomiq_swap_id, update_btc_tx_hash,
        vesu_history, vesu_pools, vesu_positions,
    },
};

mod handler;

pub struct Server {
    pub port: u16,
    pub handler_state: Arc<HandlerState>,
}

impl Server {
    pub fn new(
        port: u16,
        coingecko: Arc<CoingeckoFiatProvider>,
        supported_assets: Vec<Asset>,
        vesu_api_base_url: String,
        vault_registry: Arc<VaultRegistry>,
        orderbook: Arc<OrderbookProvider>,
    ) -> Self {
        let handler_state = Arc::new(HandlerState {
            coingecko,
            supported_assets,
            vesu_api_base_url,
            vault_registry,
            orderbook,
        });
        Self {
            port,
            handler_state,
        }
    }

    pub async fn run(&self) {
        let cors = CorsLayer::new()
            .allow_methods(vec![Method::GET, Method::POST])
            .allow_origin(Any)
            .allow_headers(AllowHeaders::any());

        let app = Router::new()
            .route("/health", get(get_health))
            .route("/assets", get(supported_assets))
            .route("/deposit", post(create_deposit))
            .route("/deposit/:deposit_id", get(get_deposit))
            .route("/deposits/created", get(get_created_deposits))
            .route("/deposits/user/:user_address", get(get_user_deposits))
            .route(
                "/deposit/:deposit_id/atomiq-swap-id",
                post(update_atomiq_swap_id),
            )
            .route("/deposit/:deposit_id/btc-tx-hash", post(update_btc_tx_hash))
            .nest(
                "/vesu",
                Router::new()
                    .route("/positions", get(vesu_positions))
                    .route("/history", get(vesu_history))
                    .route("/pools", get(vesu_pools)),
            )
            .layer(cors)
            .with_state(Arc::clone(&self.handler_state));

        let addr = SocketAddr::from(([0, 0, 0, 0], self.port));
        info!("Listening on http://{}", addr);

        let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
        axum::serve(listener, app).await.unwrap();
    }
}
