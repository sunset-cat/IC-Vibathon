import React, { useState, useEffect } from "react";
import {
  provideLiquidity,
  getCanisterEvmAddress,
} from "../services/liquidityService";
import { sendUSDC } from "../services/metamaskService";

const CHAINS = [
  { label: "Polygon", value: "polygon" },
  { label: "BSC", value: "bsc" },
];

function getUsdcAddressForChain(chain: string): string {
  if (chain === "polygon") return "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
  if (chain === "bsc") return "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d";
  return "";
}

function getBlockExplorerUrl(chain: string, txHash: string): string {
  if (chain === "polygon") return `https://polygonscan.com/tx/${txHash}`;
  if (chain === "bsc") return `https://bscscan.com/tx/${txHash}`;
  return "";
}

export default function ProvideLiquidityForm({
  evmAddress,
  onProvided,
}: {
  evmAddress: string;
  onProvided?: () => void;
}) {
  const [chain, setChain] = useState(CHAINS[0].value);
  const [amount, setAmount] = useState(0);
  const [askPrice, setAskPrice] = useState(10000);
  const [status, setStatus] = useState<string | null>(null);
  const [canisterEvm, setCanisterEvm] = useState<string>("");
  const [isSending, setIsSending] = useState(false);
  const [txHash, setTxHash] = useState<string>("");
  const [metaMaskConnected, setMetaMaskConnected] = useState<boolean>(false);

  useEffect(() => {
    getCanisterEvmAddress().then(setCanisterEvm);
    // Detect MetaMask connection
    if ((window as any).ethereum && (window as any).ethereum.selectedAddress) {
      setMetaMaskConnected(true);
    } else {
      setMetaMaskConnected(false);
    }
    // Listen for account changes
    if ((window as any).ethereum) {
      (window as any).ethereum.on("accountsChanged", (accounts: string[]) => {
        setMetaMaskConnected(accounts && accounts.length > 0);
      });
    }
  }, []);

  const handleSendUSDC = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    setIsSending(true);
    setTxHash("");
    try {
      const usdcAddress = getUsdcAddressForChain(chain);
      const txHash = await sendUSDC(
        canisterEvm,
        amount.toString(),
        usdcAddress,
      );
      setTxHash(txHash);
      setStatus("USDC sent! Waiting for backend confirmation...");
      await provideLiquidity(chain, amount, askPrice, txHash, evmAddress);
      setStatus("Liquidity provided successfully!");
      if (onProvided) onProvided();
    } catch (err: any) {
      setStatus(err.message || "Error providing liquidity");
    } finally {
      setIsSending(false);
    }
  };

  const isFormValid =
    metaMaskConnected &&
    !!evmAddress &&
    !!canisterEvm &&
    amount > 0 &&
    askPrice > 0;

  return (
    <form className="space-y-2" onSubmit={handleSendUSDC}>
      <div>
        <label>Chain:</label>
        <select
          value={chain}
          onChange={(e) => setChain(e.target.value)}
          className="input"
        >
          {CHAINS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label>Amount (USDC):</label>
        <input
          type="number"
          className="input"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          min={1}
          required
        />
      </div>
      <div>
        <label>Ask Price (basis points):</label>
        <input
          type="number"
          className="input"
          value={askPrice}
          onChange={(e) => setAskPrice(Number(e.target.value))}
          min={1}
          required
        />
      </div>
      <div>
        <label>Your EVM Address:</label>
        <input type="text" className="input" value={evmAddress} readOnly />
      </div>
      <div>
        <label>Canister EVM Address:</label>
        <input type="text" className="input" value={canisterEvm} readOnly />
      </div>
      <button
        className="btn btn-primary flex items-center gap-2"
        type="submit"
        disabled={!isFormValid || isSending}
      >
        {isSending && (
          <span className="loader h-4 w-4 animate-spin rounded-full border-2 border-t-2 border-gray-200"></span>
        )}
        {isSending ? "Processing..." : "Send USDC & Provide"}
      </button>
      {txHash && (
        <div className="text-xs text-blue-600">
          View transaction:{" "}
          <a
            href={getBlockExplorerUrl(chain, txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-700 underline"
          >
            {txHash.slice(0, 8)}...{txHash.slice(-6)}
          </a>
        </div>
      )}
      {status && <div className="text-xs text-blue-600">{status}</div>}
    </form>
  );
}
