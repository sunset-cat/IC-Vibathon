import { backend } from "../../../declarations/backend";

export type Liquidity = {
  user: string;
  chain: string;
  amount: number;
  ask_price: number;
  withdrawn: boolean;
};

export async function provideLiquidity(
  chain: string,
  amount: number,
  askPrice: number,
  txHash: string,
  evmAddress: string,
): Promise<void> {
  await backend.provide_liquidity(chain, amount, askPrice, txHash, evmAddress);
}

export async function getMyLiquidity(user: string): Promise<Liquidity[]> {
  return await backend.get_liquidity(user);
}

export async function withdrawLiquidity(chain: string): Promise<void> {
  await backend.withdraw_liquidity(chain);
}

export async function getCanisterEvmAddress(): Promise<string> {
  return await backend.get_canister_evm_address();
}

export async function buyUSDC(
  fromChain: string,
  toChain: string,
  amount: bigint,
  txHash: string,
  buyer: string,
): Promise<void> {
  await backend.buy_usdc(fromChain, toChain, amount, txHash, buyer);
}
