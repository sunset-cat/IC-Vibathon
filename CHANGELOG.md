# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add set_count update method to allow setting the counter to a specific value
- Add frontend development server scripts (`npm run start`)
- Add LLM canister implementation
- Add EVM bridge canister using ICP chain key: canister holds an EVM wallet, receives USDC on multiple EVM chains, allows users to provide liquidity with ask price, buy USDC by cross-chain transfer, and withdraw liquidity. Tracks liquidity per user and verifies EVM transactions on-chain.
- Add mutex-like BusyGuard for safe concurrent access to liquidity state.
- Add replay protection for provide_liquidity by tracking used tx_hash values.
- Require EVM tx verification for provide_liquidity (user must supply tx_hash and EVM address).
- Use actual canister EVM address (cached or async) in all EVM business logic.

### Changed

- Update dependencies to latest versions

## [0.1.0] - 2025-04-24

### Added

- Basic canister structure with Rust
- Counter functionality with increment and get_count methods
- Greeting functionality
- PocketIC testing infrastructure
- Vitest test runner configuration
- GitHub CI workflow for automated end-to-end tests for all methods
- Project documentation
- Add custom instructions for github copilot
