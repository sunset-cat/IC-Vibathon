import React, { useState } from "react";
import MetaMaskConnect from "../components/MetaMaskConnect";
import ProvideLiquidityForm from "../components/ProvideLiquidityForm";
import MyLiquidityList from "../components/MyLiquidityList";
import AllLiquidityList from "../components/AllLiquidityList";
import BuyUSDCForm from "../components/BuyUSDCForm";

export default function LiquidityDashboard() {
  const [evmAddress, setEvmAddress] = useState<string>("");
  const [chainId, setChainId] = useState<string>("");

  // Map chainId to chain name
  const chainMap: Record<string, string> = {
    "137": "polygon",
    "56": "bsc",
  };
  const currentChain = chainMap[chainId] || "polygon";

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="mb-4 text-2xl font-bold">USDC Cross-Chain Liquidity</h1>
      <MetaMaskConnect
        onConnect={(addr, chain) => {
          setEvmAddress(addr);
          setChainId(chain);
        }}
      />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <ProvideLiquidityForm evmAddress={evmAddress} />
          <MyLiquidityList user={evmAddress} />
        </div>
        <div>
          <AllLiquidityList chain={currentChain} />
          <BuyUSDCForm fromChain={currentChain} buyerEvmAddress={evmAddress} />
        </div>
      </div>
    </div>
  );
}
