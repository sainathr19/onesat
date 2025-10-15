'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import defaultWallet, { AddressPurpose, RpcErrorCode } from 'sats-connect';
import { XverseBitcoinWallet } from '@/lib/bitcoin/XverseBitcoinWallet';
import { UnisatBitcoinWallet } from '@/lib/bitcoin/UnisatBitcoinWallet';
import { BitcoinNetwork } from '@atomiqlabs/sdk';
import { StarknetSigner, RpcProviderWithRetries } from '@atomiqlabs/chain-starknet';
import { connect, disconnect, StarknetWindowObject } from '@starknet-io/get-starknet';
import { WalletAccount, wallet } from 'starknet';

type NumericString = string; // keep balances as strings to avoid float issues

type Balances = {
    btc?: NumericString | null; // in sats
    stacks?: NumericString | null; // in uSTX
    starknet?: NumericString | null; // in wei
};

const BITCOIN_NETWORK = BitcoinNetwork.TESTNET4;
const BITCOIN_RPC_URL = 'https://mempool.space/testnet4/api';
const STARKNET_RPC_URL = 'https://starknet-sepolia.public.blastapi.io/rpc/v0_8';
const STARKNET_CHAIN_ID = '0x534e5f5345504f4c4941'; // SN_SEPOLIA

type WalletState = {
    // detection
    isXverseAvailable: boolean;
    isUniSatAvailable: boolean;

    // connection state
    isConnecting: boolean;
    connected: boolean;
    selectedBtcWallet: 'xverse' | 'unisat';
    setSelectedBtcWallet: (w: 'xverse' | 'unisat') => void;

    // addresses
    bitcoinPaymentAddress: string | null;
    bitcoinOrdinalsAddress: string | null;
    stacksAddress: string | null;
    starknetAddress: string | null;
    bitcoinPublicKeyHex?: string | null;

    // wallet instances (for persistence)
    bitcoinWalletType: 'xverse' | 'unisat' | null;
    starknetWalletName: string | null;

    // balances
    balances: Balances;

    // actions
    detectProviders: () => void;
    connect: () => Promise<void>;
    connectBitcoin: (walletType: 'xverse' | 'unisat') => Promise<void>;
    connectStarknet: () => Promise<void>;
    disconnect: () => Promise<void>;
    disconnectBitcoin: () => Promise<void>;
    disconnectStarknet: () => Promise<void>;
    refreshBalances: () => Promise<void>;
    reconnectWallets: () => Promise<void>;
};

async function fetchBitcoinBalanceSats(address: string): Promise<NumericString | null> {
    try {
        const res = await fetch(`https://mempool.space/testnet4/address/${address}`);
        if (!res.ok) return null;
        const data = await res.json();
        const confirmed = (data?.chain_stats?.funded_txo_sum ?? 0) - (data?.chain_stats?.spent_txo_sum ?? 0);
        const mempool = (data?.mempool_stats?.funded_txo_sum ?? 0) - (data?.mempool_stats?.spent_txo_sum ?? 0);
        const total = confirmed + mempool;
        return String(total);
    } catch {
        return null;
    }
}

async function fetchStacksBalanceUstx(address: string): Promise<NumericString | null> {
    try {
        const res = await fetch(`https://api.mainnet.hiro.so/v2/accounts/${address}?proof=0`);
        if (!res.ok) return null;
        const data = await res.json();
        const balance = data?.balance;
        return typeof balance === 'string' ? balance : balance != null ? String(balance) : null;
    } catch {
        return null;
    }
}

interface StarknetProvider {
    enable?: () => Promise<void>;
    accounts?: string[];
    selectedAddress?: string;
}

interface WindowWithProviders {
    starknet?: StarknetProvider;
    starknet_argentX?: StarknetProvider;
    starknet_braavos?: StarknetProvider;
    btc?: unknown;
    BitcoinProvider?: unknown;
}

async function resolveStarknetInjectedAddress(): Promise<string | null> {
    try {
        const windowWithProviders = window as Window & WindowWithProviders;
        const provider = windowWithProviders?.starknet || windowWithProviders?.starknet_argentX || windowWithProviders?.starknet_braavos;
        if (!provider) return null;
        await provider.enable?.();
        const accounts = provider?.accounts;
        const candidate = Array.isArray(accounts) && accounts.length > 0 ? accounts[0] : provider?.selectedAddress;
        return typeof candidate === 'string' ? candidate : null;
    } catch {
        return null;
    }
}

export const useWallet = create<WalletState>()(
    persist(
        (set, get) => ({
            isXverseAvailable: false,
            isUniSatAvailable: false,
            isConnecting: false,
            connected: false,
            selectedBtcWallet: 'xverse',
            bitcoinPaymentAddress: null,
            bitcoinOrdinalsAddress: null,
            stacksAddress: null,
            starknetAddress: null,
            bitcoinPublicKeyHex: null,
            bitcoinWalletType: null,
            starknetWalletName: null,
            balances: {},

            detectProviders: () => {
                if (typeof window === 'undefined') return;
                const windowWithProviders = window as Window & WindowWithProviders & { unisat?: unknown };
                const hasXverse = Boolean(windowWithProviders.btc || windowWithProviders.BitcoinProvider);
                const hasUnisat = Boolean((window as unknown as { unisat?: unknown }).unisat);
                set({ isXverseAvailable: hasXverse, isUniSatAvailable: hasUnisat });
            },

            setSelectedBtcWallet: (w) => set({ selectedBtcWallet: w }),

            connect: async () => {
                try {
                    set({ isConnecting: true });
                    const response = await defaultWallet.request('wallet_connect', null);
                    if (response.status === 'success') {
                        const addresses = response.result.addresses || [];
                        const paymentItem = addresses.find((a: { purpose: AddressPurpose; address: string; publicKey?: string }) => a.purpose === AddressPurpose.Payment);
                        const payment = paymentItem?.address || null;
                        const pubkey = paymentItem?.publicKey || null;
                        const starknet = await resolveStarknetInjectedAddress();
                        set({
                            bitcoinPaymentAddress: payment,
                            bitcoinOrdinalsAddress: null,
                            stacksAddress: null,
                            starknetAddress: starknet,
                            bitcoinPublicKeyHex: typeof pubkey === 'string' ? pubkey : null,
                            connected: Boolean(payment),
                        });
                        await get().refreshBalances();
                    } else {
                        if (response.error.code === RpcErrorCode.USER_REJECTION) {
                            // user cancelled, keep state
                        } else {
                            alert(response.error.message || 'Failed to connect wallet');
                        }
                    }
                } catch (err: unknown) {
                    const error = err as { error?: { message?: string }; message?: string };
                    const message = error?.error?.message || error?.message || 'Unexpected error while connecting wallet';
                    alert(message);
                } finally {
                    set({ isConnecting: false });
                }
            },

            connectBitcoin: async (walletType: 'xverse' | 'unisat') => {
                const currentState = get();
                if (currentState.isConnecting || currentState.bitcoinPaymentAddress) {
                    console.log('Bitcoin wallet already connected or connecting, skipping...');
                    return;
                }
                
                try {
                    set({ isConnecting: true });
                    
                    // Use the same connection logic as ChainDataProvider
                    let wallet: XverseBitcoinWallet | UnisatBitcoinWallet;

                    if (walletType === 'xverse') {
                        wallet = await XverseBitcoinWallet.connect(BITCOIN_NETWORK, BITCOIN_RPC_URL);
                    } else {
                        wallet = await UnisatBitcoinWallet.connect(BITCOIN_NETWORK, BITCOIN_RPC_URL);
                    }

                    const address = wallet.getReceiveAddress();
                    set({
                        bitcoinPaymentAddress: address,
                        bitcoinWalletType: walletType,
                        connected: Boolean(address && get().starknetAddress),
                    });
                    
                    console.log(`${walletType} wallet connected via store:`, address);
                } catch (error) {
                    console.error(`Failed to connect ${walletType} wallet:`, error);
                    throw error;
                } finally {
                    set({ isConnecting: false });
                }
            },

            connectStarknet: async () => {
                const currentState = get();
                if (currentState.isConnecting || currentState.starknetAddress) {
                    console.log('Starknet wallet already connected or connecting, skipping...');
                    return;
                }
                
                try {
                    set({ isConnecting: true });
                    const swo = await connect({ modalMode: 'alwaysAsk', modalTheme: 'dark' });
                    
                    if (!swo) {
                        throw new Error('Failed to connect Starknet wallet');
                    }

                    const walletAccount = await WalletAccount.connect(
                        new RpcProviderWithRetries({ nodeUrl: STARKNET_RPC_URL }),
                        swo
                    );

                    // Wait for address to be populated
                    const maxAttempts = 50;
                    for (let i = 0; i < maxAttempts; i++) {
                        if (walletAccount.address !== '0x0000000000000000000000000000000000000000000000000000000000000000' && walletAccount.address !== '') {
                            break;
                        }
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }

                    set({
                        starknetAddress: walletAccount.address,
                        starknetWalletName: swo.name,
                        connected: Boolean(walletAccount.address && get().bitcoinPaymentAddress),
                    });
                    
                    console.log('Starknet wallet connected via store:', walletAccount.address);
                } catch (error) {
                    console.error('Failed to connect Starknet wallet:', error);
                    throw error;
                } finally {
                    set({ isConnecting: false });
                }
            },

            disconnect: async () => {
                try {
                    await defaultWallet.disconnect();
                } catch {
                    // ignore
                }
                set({
                    connected: false,
                    bitcoinPaymentAddress: null,
                    bitcoinOrdinalsAddress: null,
                    stacksAddress: null,
                    starknetAddress: null,
                    bitcoinPublicKeyHex: null,
                    bitcoinWalletType: null,
                    starknetWalletName: null,
                    balances: {},
                });
            },

            disconnectBitcoin: async () => {
                set({
                    bitcoinPaymentAddress: null,
                    bitcoinWalletType: null,
                    connected: Boolean(get().starknetAddress),
                });
            },

            disconnectStarknet: async () => {
                try {
                    await disconnect({ clearLastWallet: true });
                } catch {
                    // ignore
                }
                set({
                    starknetAddress: null,
                    starknetWalletName: null,
                    connected: Boolean(get().bitcoinPaymentAddress),
                });
            },

            reconnectWallets: async () => {
                const { bitcoinWalletType, starknetWalletName, bitcoinPaymentAddress, starknetAddress } = get();
                
                try {
                    // Only reconnect if we have stored wallet types but no current addresses
                    if (bitcoinWalletType && !bitcoinPaymentAddress) {
                        // Avoid auto-reconnecting Xverse to prevent repeated popup prompts
                        if (bitcoinWalletType === 'xverse') {
                            console.log('Skipping auto-reconnect for Xverse to avoid popup spam');
                        } else {
                            console.log('Reconnecting Bitcoin wallet:', bitcoinWalletType);
                            await get().connectBitcoin(bitcoinWalletType);
                        }
                    }
                    if (starknetWalletName && !starknetAddress) {
                        console.log('Reconnecting Starknet wallet:', starknetWalletName);
                        await get().connectStarknet();
                    }
                } catch (error) {
                    console.error('Failed to reconnect wallets:', error);
                }
            },

            refreshBalances: async () => {
                const { bitcoinPaymentAddress, stacksAddress } = get();
                const [btc, stx] = await Promise.all([
                    bitcoinPaymentAddress ? fetchBitcoinBalanceSats(bitcoinPaymentAddress) : Promise.resolve(null),
                    stacksAddress ? fetchStacksBalanceUstx(stacksAddress) : Promise.resolve(null),
                ]);
                set({ balances: { ...get().balances, btc, stacks: stx } });
                // Starknet balance retrieval requires a JSON-RPC provider; leaving as null for now
            },
        }),
        {
            name: 'wallet-store',
            partialize: (state) => ({
                isXverseAvailable: state.isXverseAvailable,
                isUniSatAvailable: state.isUniSatAvailable,
                selectedBtcWallet: state.selectedBtcWallet,
                connected: state.connected,
                bitcoinPaymentAddress: state.bitcoinPaymentAddress,
                bitcoinOrdinalsAddress: state.bitcoinOrdinalsAddress,
                stacksAddress: state.stacksAddress,
                starknetAddress: state.starknetAddress,
                bitcoinPublicKeyHex: state.bitcoinPublicKeyHex,
                bitcoinWalletType: state.bitcoinWalletType,
                starknetWalletName: state.starknetWalletName,
                balances: state.balances,
            }),
        }
    )
);


