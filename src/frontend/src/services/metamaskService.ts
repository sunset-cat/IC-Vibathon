import { ethers } from "ethers";

export async function connectMetaMask(): Promise<string | null> {
  if (!(window as any).ethereum) return null;
  const provider = new ethers.BrowserProvider((window as any).ethereum);
  const accounts = await provider.send("eth_requestAccounts", []);
  return accounts[0] || null;
}

export async function getCurrentChainId(): Promise<string | null> {
  if (!(window as any).ethereum) return null;
  const provider = new ethers.BrowserProvider((window as any).ethereum);
  const network = await provider.getNetwork();
  return network.chainId.toString();
}

export async function sendUSDC(
  to: string,
  amount: string,
  usdcAddress: string,
): Promise<string> {
  if (!(window as any).ethereum) throw new Error("MetaMask not found");
  const provider = new ethers.BrowserProvider((window as any).ethereum);
  const signer = await provider.getSigner();
  const usdc = new ethers.Contract(
    usdcAddress,
    ["function transfer(address to, uint256 amount) public returns (bool)"],
    signer,
  );
  const tx = await usdc.transfer(to, amount);
  await tx.wait();
  return tx.hash;
}
