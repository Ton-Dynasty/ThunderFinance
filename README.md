# ThunderMint Contracts

ThunderMint Contracts aims to resolve key issues in the TON blockchain's DeFi ecosystem by providing innovative solutions for liquidity and secure smart contract development.

## Architecture

![ThunderMint Architecture](Architecture.png)

## Problems Identified

1. **Liquidity Challenges:**
   - The TON blockchain suffers from low liquidity due to inadequate incentives.
   
2. **Development Barriers:**
   - Crafting secure smart contracts for DeFi is a complex and lengthy process.
   - There's a pressing need for toolkits to streamline access to TON's DeFi ecosystem.

## Proposed Solutions

### Liquidity Mining Innovations

- **One-Click Pool Creation:** Simplify the process of pool creation to a single click.
- **Streamlined Setup:** Users can engage with the platform easily, removing technical hurdles.

### DeFi Toolkit Enhancements

- **Flash Minting:** Provide a method for instantaneous token minting for flexible DeFi operations.
- **Merkle Lightning Airdrop:** Facilitate a rapid and secure method of token distribution.

## Target Market Insights

- **For Protocols:**
  - **Need:** Augment liquidity and user attraction.
  - **Value Proposition:** Enable one-click setup for liquidity mining, fostering enhanced user participation.

- **For Founders:**
  - **Need:** Streamline token issuance and ensure broad distribution.
  - **Value Proposition:** Offer flash minting and Merkle lightning airdrops for efficient and secure token dissemination.

- **For LP Providers:**
  - **Need:** Simplify and make liquidity provision profitable.
  - **Value Proposition:** Provide easier staking options, alluring rewards, and reduced barriers for newcomers.

<!-- ## Deployment Guide

### For MerkleDistributor

1. `deployAirdropFactory`
2. `deployMerkleDistributor`
3. `claimMerkleDistributor`

### For Liquidity Mining

1. `deployKitchen`
2. `buildMasterChef`
3. `addPool`
4. `transferToMasterChef`
5. `userDeposit`
6. `userWithdraw`
7. `userHarvest`
8. `updatePool`
9. `getMasterMetaData` -->

## Quick Start

Set up the development environment and run tests using the following commands:

```bash
yarn install     # Install dependencies
yarn dev         # Run the development environment
yarn test        # Execute test suites
