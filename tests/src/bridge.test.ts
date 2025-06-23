import { Actor, Principal } from "@dfinity/agent";
import { createActor } from "../../src/declarations/backend";

describe("EVM Bridge Canister", () => {
  let actor;
  const user = Principal.anonymous();

  beforeEach(async () => {
    actor = createActor();
  });

  it("should allow a user to provide liquidity", async () => {
    const chain = "polygon";
    const amount = 100_000_000; // 100 USDC (6 decimals)
    const ask_price = 11000; // 1.1x
    await actor.provide_liquidity(chain, amount, ask_price);
    const liquidity = await actor.get_liquidity(user);
    expect(liquidity.length).toBeGreaterThan(0);
    expect(liquidity[0].amount).toBe(amount);
    expect(liquidity[0].ask_price).toBe(ask_price);
    expect(liquidity[0].chain).toBe(chain);
  });

  // TODO: Add tests for buy and withdraw flows
});
