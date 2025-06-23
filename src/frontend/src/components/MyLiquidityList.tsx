import React, { useEffect, useState } from "react";
import {
  getMyLiquidity,
  withdrawLiquidity,
  Liquidity,
} from "../services/liquidityService";

export default function MyLiquidityList({ user }: { user: string }) {
  const [liquidity, setLiquidity] = useState<Liquidity[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  const fetchLiquidity = async () => {
    try {
      const data = await getMyLiquidity(user);
      setLiquidity(data);
    } catch (err: any) {
      setStatus(err.message || "Error fetching liquidity");
    }
  };

  useEffect(() => {
    fetchLiquidity();
  }, [user]);

  const handleWithdraw = async (chain: string) => {
    setStatus(null);
    try {
      await withdrawLiquidity(chain);
      setStatus("Withdrawn successfully");
      fetchLiquidity();
    } catch (err: any) {
      setStatus(err.message || "Error withdrawing");
    }
  };

  return (
    <div>
      <h3 className="mb-2 font-bold">My Liquidity</h3>
      {liquidity.length === 0 ? (
        <div>No active liquidity positions.</div>
      ) : (
        <table className="w-full table-auto text-xs">
          <thead>
            <tr>
              <th>Chain</th>
              <th>Amount</th>
              <th>Ask Price</th>
              <th>Withdraw</th>
            </tr>
          </thead>
          <tbody>
            {liquidity.map((l, i) => (
              <tr key={i}>
                <td>{l.chain}</td>
                <td>{l.amount}</td>
                <td>{l.ask_price}</td>
                <td>
                  <button
                    className="btn btn-xs btn-warning"
                    onClick={() => handleWithdraw(l.chain)}
                  >
                    Withdraw
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {status && <div className="mt-2 text-xs text-blue-600">{status}</div>}
    </div>
  );
}
