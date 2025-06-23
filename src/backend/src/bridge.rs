use candid::{CandidType, Principal};
use evm_rpc_api::*;
use ic_alloy::abi::{Event, ParamType, RawLog, Token as AbiToken};
use ic_alloy::signing::ecdsa::EcdsaKeyId;
use ic_alloy::types::{Address, TransactionRequest, U256, U64};
use ic_alloy::utils::keccak256;
use ic_cdk::api::call::call_with_payment128;
use ic_cdk::api::management_canister::ecdsa::{sign_with_ecdsa, SignWithEcdsaArgument};
use ic_cdk::export_candid;
use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
#[derive(CandidType, Clone, Debug, PartialEq)]
pub struct Liquidity {
    pub user: Principal,
    pub chain: String,
    pub amount: u64,    // USDC amount in smallest unit
    pub ask_price: u64, // price in basis points (e.g. 11000 = 1.1x)
    pub withdrawn: bool,
    pub evm_address: String, // Seller's EVM address
}

thread_local! {
    static LIQUIDITY: RefCell<Vec<Liquidity>> = RefCell::new(Vec::new());
    static CACHED_EVM_ADDRESS: RefCell<Option<String>> = RefCell::new(None);
    static BUSY: RefCell<bool> = RefCell::new(false);
    static USED_LIQUIDITY_TXS: RefCell<HashSet<String>> = RefCell::new(HashSet::new());
}

struct BusyGuard;
impl BusyGuard {
    fn try_lock() -> Result<Self, String> {
        BUSY.with(|b| {
            let mut busy = b.borrow_mut();
            if *busy {
                Err("Canister busy, try again soon".to_string())
            } else {
                *busy = true;
                Ok(BusyGuard)
            }
        })
    }
}
impl Drop for BusyGuard {
    fn drop(&mut self) {
        BUSY.with(|b| *b.borrow_mut() = false);
    }
}

#[ic_cdk::update]
pub async fn provide_liquidity(
    chain: String,
    amount: u64,
    ask_price: u64,
    tx_hash: String,
    evm_address: String, // Liquidity provider's EVM address
) -> Result<(), String> {
    let _guard = BusyGuard::try_lock()?;
    // Prevent replay: check if tx_hash already used
    let already_used = USED_LIQUIDITY_TXS.with(|set| set.borrow().contains(&tx_hash));
    if already_used {
        return Err("This tx_hash has already been used to provide liquidity".to_string());
    }
    // Strict: require EVM address to be initialized
    let canister_address = CACHED_EVM_ADDRESS
        .with(|c| c.borrow().clone())
        .ok_or_else(|| "Canister EVM address not initialized".to_string())?;
    // Verify the USDC transfer from the provider to the canister address
    let verified = verify_evm_tx(
        &chain,
        &tx_hash,
        &evm_address,
        &canister_address,
        U256::from(amount),
    )
    .await?;
    if !verified {
        return Err("EVM transaction verification failed for liquidity provision".to_string());
    }
    let user = ic_cdk::caller();
    LIQUIDITY.with(|liq| {
        liq.borrow_mut().push(Liquidity {
            user,
            chain,
            amount,
            ask_price,
            withdrawn: false,
            evm_address: evm_address.clone(),
        });
    });
    // Mark tx_hash as used
    USED_LIQUIDITY_TXS.with(|set| {
        set.borrow_mut().insert(tx_hash);
    });
    Ok(())
}

#[ic_cdk::query]
pub fn get_liquidity(user: Principal) -> Vec<Liquidity> {
    LIQUIDITY.with(|liq| {
        liq.borrow()
            .iter()
            .filter(|l| l.user == user && !l.withdrawn)
            .cloned()
            .collect()
    })
}

#[ic_cdk::update]
pub fn withdraw_liquidity(chain: String) -> Result<(), String> {
    let _guard = BusyGuard::try_lock()?;
    let user = ic_cdk::caller();
    LIQUIDITY.with(|liq| {
        let mut liq = liq.borrow_mut();
        let mut found = false;
        for l in liq.iter_mut() {
            if l.user == user && l.chain == chain && !l.withdrawn {
                l.withdrawn = true;
                found = true;
            }
        }
        if found {
            Ok(())
        } else {
            Err("No liquidity found to withdraw".to_string())
        }
    })
}

const EVM_CANISTER_ID: &str = "<your-evm-canister-principal>";

// Helper: Parse logs for ERC20 Transfer event
fn find_erc20_transfer(
    logs: &[evm_rpc_api::Log],
    expected_from: &str,
    expected_to: &str,
    expected_amount: U256,
) -> bool {
    // ERC20 Transfer(address indexed from, address indexed to, uint256 value)
    let transfer_sig = keccak256(b"Transfer(address,address,uint256)");
    for log in logs {
        if log.topics.len() == 3 && log.topics[0] == format!("0x{}", hex::encode(transfer_sig)) {
            // topics[1] = from, topics[2] = to (both as 32-byte hex)
            let from = format!("0x{}", &log.topics[1][26..]);
            let to = format!("0x{}", &log.topics[2][26..]);
            // decode value from data (32 bytes)
            if let Ok(data_bytes) = hex::decode(&log.data[2..]) {
                if data_bytes.len() == 32 {
                    let value = U256::from_big_endian(&data_bytes);
                    if from.eq_ignore_ascii_case(expected_from)
                        && to.eq_ignore_ascii_case(expected_to)
                        && value == expected_amount
                    {
                        return true;
                    }
                }
            }
        }
    }
    false
}

// Helper: Call EVM canister to verify ERC20 Transfer event in transaction receipt
async fn verify_evm_tx(
    chain: &str,
    tx_hash: &str,
    expected_from: &str,
    expected_to: &str,
    expected_amount: U256,
) -> Result<bool, String> {
    let rpc_service = match chain {
        "polygon" => RpcServices::PolygonMainnet(None),
        "bsc" => RpcServices::BscMainnet(None),
        _ => return Err("Unsupported chain".to_string()),
    };
    let cycles = 20_000_000_000u128;
    let (result,): (MultiGetTransactionReceiptResult,) = call_with_payment128(
        Principal::from_text(EVM_CANISTER_ID).unwrap(),
        "eth_getTransactionReceipt",
        (rpc_service, (), tx_hash.to_string()),
        cycles,
    )
    .await
    .map_err(|e| format!("EVM canister call failed: {e:?}"))?;
    match result {
        MultiGetTransactionReceiptResult::Consistent(receipt_result) => match receipt_result {
            GetTransactionReceiptResult::Ok(Some(receipt)) => {
                if find_erc20_transfer(&receipt.logs, expected_from, expected_to, expected_amount) {
                    Ok(true)
                } else {
                    Ok(false)
                }
            }
            _ => Ok(false),
        },
        _ => Ok(false),
    }
}

// Helper: Fetch EVM tx params (nonce, gas, gas_price, chain_id) from EVM canister
async fn fetch_evm_tx_params(
    chain: &str,
    from_address: &str,
) -> Result<(U64, U64, U64, U64), String> {
    let rpc_services = match chain {
        "polygon" => RpcServices::PolygonMainnet(None),
        "bsc" => RpcServices::BscMainnet(None),
        _ => return Err("Unsupported chain".to_string()),
    };
    let cycles = 20_000_000_000u128;
    // Fetch nonce
    let (nonce_result,): (GetTransactionCountResult,) = call_with_payment128(
        Principal::from_text(EVM_CANISTER_ID).unwrap(),
        "eth_getTransactionCount",
        (rpc_services.clone(), (), from_address.to_string()),
        cycles,
    )
    .await
    .map_err(|e| format!("EVM canister call failed: {e:?}"))?;
    let nonce = match nonce_result {
        GetTransactionCountResult::Ok(n) => U64::from(n),
        _ => return Err("Failed to fetch nonce".to_string()),
    };
    // Fetch gas price
    let (gas_price_result,): (GetGasPriceResult,) = call_with_payment128(
        Principal::from_text(EVM_CANISTER_ID).unwrap(),
        "eth_gasPrice",
        (rpc_services.clone(), ()),
        cycles,
    )
    .await
    .map_err(|e| format!("EVM canister call failed: {e:?}"))?;
    let gas_price = match gas_price_result {
        GetGasPriceResult::Ok(g) => U64::from(g),
        _ => return Err("Failed to fetch gas price".to_string()),
    };
    // Fetch chain id
    let (chain_id_result,): (GetChainIdResult,) = call_with_payment128(
        Principal::from_text(EVM_CANISTER_ID).unwrap(),
        "eth_chainId",
        (rpc_services.clone(), ()),
        cycles,
    )
    .await
    .map_err(|e| format!("EVM canister call failed: {e:?}"))?;
    let chain_id = match chain_id_result {
        GetChainIdResult::Ok(id) => U64::from(id),
        _ => return Err("Failed to fetch chain id".to_string()),
    };
    // Estimate gas (simplified, could be hardcoded or improved)
    let gas = U64::from(120_000u64); // ERC20 transfer typical gas
    Ok((nonce, gas, gas_price, chain_id))
}

// Helper: Build and sign a raw Ethereum transaction for USDC transfer
async fn build_and_sign_raw_tx(
    chain: &str,
    from_address: &str, // hex string, canister EVM address
    to_address: &str,   // recipient EVM address (hex string)
    amount: U256,       // USDC amount in smallest unit (U256)
    nonce: U64,
    gas: U64,
    gas_price: U64,
    chain_id: U64,
    derivation_path: Vec<Vec<u8>>,
) -> Result<String, String> {
    let usdc_contract = match chain {
        "polygon" => "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // Polygon USDC
        "bsc" => "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",     // BSC USDC
        _ => return Err("Unsupported chain for USDC contract".to_string()),
    };
    let function_selector = &keccak256(b"transfer(address,uint256)")[..4];
    let to_addr = Address::from_slice(&hex::decode(&to_address[2..]).map_err(|e| e.to_string())?);
    let data = encode_function_data(
        function_selector,
        &[Token::Address(to_addr), Token::Uint(amount)],
    )
    .map_err(|e| format!("ABI encode error: {e:?}"))?;
    let tx = TransactionRequest {
        from: Some(Address::from_slice(
            &hex::decode(&from_address[2..]).map_err(|e| e.to_string())?,
        )),
        to: Some(Address::from_slice(
            &hex::decode(&usdc_contract[2..]).map_err(|e| e.to_string())?,
        )),
        value: Some(U256::zero()),
        data: Some(data.into()),
        nonce: Some(U256::from(nonce.as_u64())),
        gas: Some(U256::from(gas.as_u64())),
        gas_price: Some(U256::from(gas_price.as_u64())),
        chain_id: Some(U256::from(chain_id.as_u64())),
        ..Default::default()
    };
    let rlp = tx.rlp_unsigned();
    let key_id = EcdsaKeyId {
        curve: "secp256k1".to_string(),
        name: "dfx_test_key".to_string(),
    };
    let sign_arg = SignWithEcdsaArgument {
        message_hash: keccak256(&rlp).to_vec(),
        derivation_path,
        key_id,
    };
    let signature = sign_with_ecdsa(sign_arg)
        .await
        .map_err(|e| format!("ECDSA sign error: {e:?}"))?
        .0;
    let raw_tx = tx.rlp_signed(&signature);
    Ok(format!("0x{}", hex::encode(raw_tx)))
}

#[ic_cdk::update]
pub async fn buy_usdc(
    from_chain: String,
    to_chain: String,
    mut amount: U256,
    tx_hash: String,
    buyer: String, // Buyer's EVM address (hex string)
) -> Result<(), String> {
    let _guard = BusyGuard::try_lock()?;
    let canister_address = CACHED_EVM_ADDRESS
        .with(|c| c.borrow().clone())
        .ok_or_else(|| "Canister EVM address not initialized".to_string())?;
    let verified = verify_evm_tx(&from_chain, &tx_hash, &buyer, &canister_address, amount).await?;
    if !verified {
        return Err("EVM transaction verification failed".to_string());
    }
    // Gather all matching liquidity for to_chain, sorted by best ask
    let mut liquidity_matches: Vec<(usize, Liquidity)> = LIQUIDITY.with(|liq| {
        liq.borrow()
            .iter()
            .enumerate()
            .filter(|(_, l)| {
                l.chain == to_chain && !l.withdrawn && U256::from(l.amount) > U256::zero()
            })
            .map(|(i, l)| (i, l.clone()))
            .collect()
    });
    liquidity_matches.sort_by_key(|(_, l)| l.ask_price);
    let mut to_pay: Vec<(usize, Liquidity, U256, U256)> = vec![]; // (idx, liquidity, fill_amount, payout_amount)
    let mut remaining = amount;
    for (idx, l) in liquidity_matches {
        if remaining == U256::zero() {
            break;
        }
        let liq_amt = U256::from(l.amount);
        let fill = if liq_amt >= remaining {
            remaining
        } else {
            liq_amt
        };
        // payout = fill * ask_price / 10_000 (basis points)
        let payout = fill * U256::from(l.ask_price) / U256::from(10_000u64);
        to_pay.push((idx, l.clone(), fill, payout));
        remaining -= fill;
    }
    if remaining > U256::zero() {
        return Err("Not enough liquidity to fulfill buy order".to_string());
    }
    // Send USDC to buyer (total amount)
    let rpc_services = match to_chain.as_str() {
        "polygon" => RpcServices::PolygonMainnet(None),
        "bsc" => RpcServices::BscMainnet(None),
        _ => return Err("Unsupported chain for transfer".to_string()),
    };
    let (mut nonce, gas, gas_price, chain_id) =
        fetch_evm_tx_params(&to_chain, canister_address.as_str()).await?;
    let principal = ic_cdk::id();
    let derivation_path = vec![principal.as_slice().to_vec()];
    // Send to buyer
    let raw_tx = build_and_sign_raw_tx(
        &to_chain,
        canister_address.as_str(),
        &buyer,
        amount,
        nonce,
        gas,
        gas_price,
        chain_id,
        derivation_path.clone(),
    )
    .await?;
    let send_cycles = 20_000_000_000u128;
    let (send_result,): (MultiSendRawTransactionResult,) = call_with_payment128(
        Principal::from_text(EVM_CANISTER_ID).unwrap(),
        "eth_sendRawTransaction",
        (rpc_services.clone(), (), raw_tx),
        send_cycles,
    )
    .await
    .map_err(|e| format!("EVM canister send failed: {e:?}"))?;
    match send_result {
        MultiSendRawTransactionResult::Consistent(status) => match status {
            SendRawTransactionResult::Ok(_) => {}
            SendRawTransactionResult::Err(e) => {
                return Err(format!("USDC transfer to buyer failed: {e:?}"))
            }
        },
        _ => return Err("USDC transfer status inconsistent".to_string()),
    }
    // Send USDC to each seller
    for (idx, l, fill, payout) in &to_pay {
        let seller_evm = l.evm_address.clone();
        let raw_tx = build_and_sign_raw_tx(
            &to_chain,
            canister_address.as_str(),
            &seller_evm,
            *payout,
            nonce + U64::from(1 + *idx as u64),
            gas,
            gas_price,
            chain_id,
            derivation_path.clone(),
        )
        .await?;
        let (send_result,): (MultiSendRawTransactionResult,) = call_with_payment128(
            Principal::from_text(EVM_CANISTER_ID).unwrap(),
            "eth_sendRawTransaction",
            (rpc_services.clone(), (), raw_tx),
            send_cycles,
        )
        .await
        .map_err(|e| format!("EVM canister send to seller failed: {e:?}"))?;
        match send_result {
            MultiSendRawTransactionResult::Consistent(status) => match status {
                SendRawTransactionResult::Ok(_) => {}
                SendRawTransactionResult::Err(e) => {
                    return Err(format!("USDC transfer to seller failed: {e:?}"))
                }
            },
            _ => return Err("USDC transfer to seller status inconsistent".to_string()),
        }
    }
    // Update liquidity state
    LIQUIDITY.with(|liq| {
        let mut liq = liq.borrow_mut();
        for (idx, _, fill, _) in &to_pay {
            if let Some(l) = liq.get_mut(*idx) {
                let liq_amt = U256::from(l.amount);
                if liq_amt > *fill {
                    l.amount = (liq_amt - *fill).as_u64();
                } else {
                    l.withdrawn = true;
                }
            }
        }
    });
    Ok(())
}

#[ic_cdk::query]
pub async fn get_canister_evm_address() -> Result<String, String> {
    // Only return from cache, error if not present
    CACHED_EVM_ADDRESS
        .with(|c| c.borrow().clone())
        .ok_or_else(|| "Canister EVM address not initialized".to_string())
}

#[ic_cdk::init]
fn init() {
    ic_cdk::spawn(init_evm_address());
}

#[ic_cdk::post_upgrade]
fn post_upgrade() {
    ic_cdk::spawn(init_evm_address());
}

async fn init_evm_address() {
    // Only cache if not already present
    if CACHED_EVM_ADDRESS.with(|c| c.borrow().is_none()) {
        if let Ok(addr) = get_canister_evm_address().await {
            CACHED_EVM_ADDRESS.with(|c| *c.borrow_mut() = Some(addr));
        }
    }
}
export_candid!();
