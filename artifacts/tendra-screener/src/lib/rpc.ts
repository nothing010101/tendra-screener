// Stable Chain RPC client (Chain ID 988)
import { ethers } from "ethers";

export const STABLE_CHAIN_RPC = "https://rpc.stable.xyz";
export const STABLE_CHAIN_ID = 988;
export const STABLESCAN = "https://stablescan.xyz";
export const TENDRA_CONTRACT = "0x65a922caf855cd75056bd53e29cc172b66d8c9a5";

// Bonding curve constants (from contract)
const VIRTUAL_USDT = 3000;   // USDT (3000 × 1e18 in raw)
const SUPPLY = 1_000_000_000; // token supply

const TENDRA_ABI = [
  "function tokenCount() view returns (uint256)",
  "function tokenAt(uint256 index) view returns (tuple(address token, address creator, string name, string symbol, uint64 createdAt, uint128 realUsdt, uint128 tokenReserve, uint128 volume, bool graduated, address pair))",
  "function getLaunch(address token) view returns (tuple(address token, address creator, string name, string symbol, uint64 createdAt, uint128 realUsdt, uint128 tokenReserve, uint128 volume, bool graduated, address pair))",
  "function mcapOf(address token) view returns (uint256)",
  "function priceOf(address token) view returns (uint256)",
];

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

let _provider: ethers.JsonRpcProvider | null = null;
let _contract: ethers.Contract | null = null;

function getProvider(): ethers.JsonRpcProvider {
  if (!_provider) {
    _provider = new ethers.JsonRpcProvider(STABLE_CHAIN_RPC, STABLE_CHAIN_ID, {
      staticNetwork: ethers.Network.from(STABLE_CHAIN_ID),
    });
  }
  return _provider;
}

function getTendraContract(): ethers.Contract {
  if (!_contract) {
    _contract = new ethers.Contract(TENDRA_CONTRACT, TENDRA_ABI, getProvider());
  }
  return _contract;
}

export interface LaunchInfo {
  token: string;
  creator: string;
  name: string;
  symbol: string;
  createdAt: number;       // Unix seconds
  realUsdt: bigint;        // raw (18 dec)
  tokenReserve: bigint;    // raw (18 dec)
  volume: bigint;          // raw (18 dec)
  graduated: boolean;
  pair: string;
  marketCap: number;       // USDT
  price: number;           // USDT per token
}

function computePriceAndMcap(realUsdt: bigint, tokenReserve: bigint): { price: number; marketCap: number } {
  // Price = (virtualUsdt + realUsdt) / tokenReserve
  // All raw values are in 1e18 precision, so they cancel:
  //   realUsdtNum = Number(realUsdt) / 1e18  (USDT)
  //   tokenReserveNum = Number(tokenReserve) / 1e18  (tokens)
  //   price = (3000 + realUsdtNum) / tokenReserveNum  (USDT / token)
  const realUsdtNum = Number(realUsdt) / 1e18;
  const tokenReserveNum = Number(tokenReserve) / 1e18;
  if (tokenReserveNum <= 0) return { price: 0, marketCap: 0 };
  const price = (VIRTUAL_USDT + realUsdtNum) / tokenReserveNum;
  const marketCap = price * SUPPLY;
  return { price, marketCap };
}

function decodeLaunch(raw: readonly unknown[]): LaunchInfo {
  const token = raw[0] as string;
  const creator = raw[1] as string;
  const name = raw[2] as string;
  const symbol = raw[3] as string;
  const createdAt = Number(raw[4] as bigint);
  const realUsdt = raw[5] as bigint;
  const tokenReserve = raw[6] as bigint;
  const volume = raw[7] as bigint;
  const graduated = raw[8] as boolean;
  const pair = raw[9] as string;
  const { price, marketCap } = computePriceAndMcap(realUsdt, tokenReserve);
  return { token, creator, name, symbol, createdAt, realUsdt, tokenReserve, volume, graduated, pair, marketCap, price };
}

export async function getLaunch(tokenAddress: string): Promise<LaunchInfo> {
  const contract = getTendraContract();
  const raw = await contract.getLaunch(tokenAddress);
  return decodeLaunch(raw);
}

export async function getTokenCount(): Promise<number> {
  const contract = getTendraContract();
  const count = await contract.tokenCount();
  return Number(count);
}

export async function getTokenAt(index: number): Promise<LaunchInfo> {
  const contract = getTendraContract();
  const raw = await contract.tokenAt(index);
  return decodeLaunch(raw);
}

/** Batch fetch launch info for a list of addresses. Returns a Map keyed by lowercase address. */
export async function fetchOnchainBatch(addresses: string[]): Promise<Map<string, LaunchInfo>> {
  const contract = getTendraContract();
  const CHUNK = 12;
  const result = new Map<string, LaunchInfo>();

  for (let i = 0; i < addresses.length; i += CHUNK) {
    const chunk = addresses.slice(i, i + CHUNK);
    const calls = chunk.map((addr) => contract.getLaunch(addr).then(decodeLaunch).catch(() => null));
    const results = await Promise.all(calls);
    for (let j = 0; j < chunk.length; j++) {
      const info = results[j];
      if (info) result.set(chunk[j].toLowerCase(), info);
    }
  }

  return result;
}

export async function getTokenBalance(tokenAddress: string, walletAddress: string): Promise<number> {
  const erc20 = new ethers.Contract(tokenAddress, ERC20_ABI, getProvider());
  const [balance, decimals] = await Promise.all([
    erc20.balanceOf(walletAddress),
    erc20.decimals(),
  ]);
  return Number(balance) / 10 ** Number(decimals);
}

export async function getTokenBalancePct(tokenAddress: string, walletAddress: string): Promise<number> {
  const balance = await getTokenBalance(tokenAddress, walletAddress);
  return (balance / SUPPLY) * 100;
}

export function explorerTx(hash: string): string {
  return `${STABLESCAN}/tx/${hash}`;
}

export function explorerAddress(addr: string): string {
  return `${STABLESCAN}/address/${addr}`;
}

export function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr ?? "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
