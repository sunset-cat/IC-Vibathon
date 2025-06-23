import React, { useState, useEffect } from "react";
import { sendUSDC } from "../services/metamaskService";
import { backend } from "../../../declarations/backend";
import { Liquidity } from "../services/liquidityService";

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

export default function BuyUSDCForm({
  fromChain,
  buyerEvmAddress,
  onBuy,
}: {
  fromChain: string;
  buyerEvmAddress: string;
  onBuy?: () => void;
}) {
  const [toChain, setToChain] = useState(CHAINS[0].value);
  const [amount, setAmount] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [canisterEvm, setCanisterEvm] = useState<string>("");
  const [isSending, setIsSending] = useState(false);
  const [txHash, setTxHash] = useState<string>("");
  const [metaMaskConnected, setMetaMaskConnected] = useState<boolean>(false);
  const [liquidity, setLiquidity] = useState<Liquidity[]>([]);
  const [buyPrice, setBuyPrice] = useState<string>("");

  // Detect MetaMask connection
  useEffect(() => {
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

  // Fetch all available liquidity for toChain
  useEffect(() => {
    async function fetchLiquidity() {
      try {
        const all = await backend.get_all_liquidity(toChain);
        setLiquidity(
          all.filter(
            (l: Liquidity) =>
              l.chain === toChain && !l.withdrawn && l.amount > 0,
          ),
        );
      } catch (e) {
        setLiquidity([]);
      }
    }
    fetchLiquidity();
  }, [toChain, isSending]);

  // Compute buy price whenever amount or liquidity changes
  useEffect(() => {
    if (!amount || amount <= 0 || liquidity.length === 0) {
      setBuyPrice("");
      return;
    }
    // Sort by best ask
    const sorted = [...liquidity].sort((a, b) => a.ask_price - b.ask_price);
    let remaining = amount;
    let total = 0;
    for (const l of sorted) {
      if (remaining <= 0) break;
      const fill = Math.min(l.amount, remaining);
      total += (fill * l.ask_price) / 10000;
      remaining -= fill;
    }
    if (remaining > 0) {
      setBuyPrice("Not enough liquidity");
    } else {
      setBuyPrice(total.toFixed(2) + " USDC");
    }
  }, [amount, liquidity]);

  const handleSendUSDC = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus(null);
    setTxHash("");
    setIsSending(true);
    try {
      // Get USDC address on the fromChain
      const usdcAddress = getUsdcAddressForChain(fromChain);
      if (!usdcAddress) throw new Error("Unsupported chain");

      // Approve the transaction
      const approval = await sendUSDC(buyerEvmAddress, usdcAddress, amount);
      if (!approval) throw new Error("Approval failed");

      // Wait for 1 confirmation
      setStatus("Waiting for confirmation...");
      const receipt = await approval.wait(1);
      if (!receipt || receipt.status !== 1)
        throw new Error("Transaction failed");

      setTxHash(receipt.transactionHash);
      setStatus("Transaction successful!");
      if (onBuy) onBuy();
    } catch (error: any) {
      setStatus(error.message || "An error occurred");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <form className="space-y-2" onSubmit={handleSendUSDC}>
      <div>
        <label>From Chain:</label>
        <select
          value={fromChain}
          onChange={(e) => {
            const chain = e.target.value;
            setFromChain(chain);
            setUsdcAddress(getUsdcAddressForChain(chain));
          }}
          disabled={isSending}
        >
          {CHAINS.map((chain) => (
            <option key={chain.value} value={chain.value}>
              {chain.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label>To Chain:</label>
        <select
          value={toChain}
          onChange={(e) => setToChain(e.target.value)}
          disabled={isSending}
        >
          {CHAINS.map((chain) => (
            <option key={chain.value} value={chain.value}>
              {chain.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label>Amount:</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          disabled={isSending}
        />
      </div>
      <div>
        <label>Estimated Buy Price:</label>
        <input type="text" className="input" value={buyPrice} readOnly />
      </div>
      <div>
        <button
          type="submit"
          className="btn"
          disabled={isSending || !amount || amount <= 0}
        >
          {isSending ? "Sending..." : "Buy USDC"}
        </button>
      </div>
      {status && <div className="status">{status}</div>}
      {txHash && (
        <div>
          Transaction Hash:{" "}
          <a
            href={getBlockExplorerUrl(fromChain, txHash)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {txHash}
          </a>
        </div>
      )}
    </form>
  );
}
