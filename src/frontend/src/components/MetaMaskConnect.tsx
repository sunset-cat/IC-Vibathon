import { useState, useEffect } from "react";
import {
  connectMetaMask,
  getCurrentChainId,
} from "../services/metamaskService";

export default function MetaMaskConnect({
  onConnect,
}: {
  onConnect: (address: string, chainId: string) => void;
}) {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    try {
      const addr = await connectMetaMask();
      if (!addr) throw new Error("MetaMask not found or not connected");
      setAddress(addr);
      const chain = await getCurrentChainId();
      setChainId(chain);
      onConnect(addr, chain!);
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    // Optionally auto-connect on mount
  }, []);

  return (
    <div className="flex flex-col items-start gap-2">
      <button className="btn btn-primary" onClick={connect}>
        {address
          ? `Connected: ${address.slice(0, 6)}...${address.slice(-4)}`
          : "Connect MetaMask"}
      </button>
      {chainId && <span className="text-xs">Chain ID: {chainId}</span>}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
