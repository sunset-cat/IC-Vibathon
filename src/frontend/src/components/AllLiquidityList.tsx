import React, { useEffect, useState } from "react";
import { backend } from "../../../declarations/backend";
import { Liquidity } from "../services/liquidityService";

export default function AllLiquidityList({ chain }: { chain: string }) {
  const [liquidity, setLiquidity] = useState<Liquidity[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  const fetchAll = async () => {
    try {
      // This assumes a backend.get_all_liquidity(chain) exists. If not, you may need to fetch all and filter client-side.
      const all = await backend.get_all_liquidity(chain);
      setLiquidity(all);
    } catch (err: any) {
      setStatus(err.message || "Error fetching all liquidity");
    }
  };

  useEffect(() => {
    fetchAll();
  }, [chain]);

  return (
    <div>
      <h3 className="mb-2 font-bold">All Liquidity for {chain}</h3>
      {liquidity.length === 0 ? (
        <div>No liquidity available for this chain.</div>
      ) : (
        <table className="w-full table-auto text-xs">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Amount</th>
              <th>Ask Price</th>
            </tr>
          </thead>
          <tbody>
            {liquidity.map((l, i) => (
              <tr key={i}>
                <td>{l.user}</td>
                <td>{l.amount}</td>
                <td>{l.ask_price}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {status && <div className="mt-2 text-xs text-blue-600">{status}</div>}
    </div>
  );
}
