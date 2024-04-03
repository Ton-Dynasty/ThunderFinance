# Thunder Mint

<a href="https://t.me/TictonOfficial" target="_blank"><img alt="Telegram" src="https://img.shields.io/badge/Telegram-2CA5E0.svg?&style=for-the-badge&logo=telegram&logoColor=white" /></a>



Welcome to Thunder Mint, the revolutionary platform that empowers project creators to launch their liquidity mining pools with just a click. By offering a seamless way to reward users with platform tokens for their liquidity provider (LP) tokens, we're setting a new standard in enhancing DEX liquidity through our innovative incentive mechanisms. Our goal is to make entering the TON blockchain as easy as possible for everyone, with our one-click token creation and airdrop distribution system powered by Merkle Distributor.

## Features

- **One-Click Liquidity Pool Launch**: Create your liquidity mining pools effortlessly, allowing you to focus on building your community and project.
- **Reward Distribution**: Reward your users with platform tokens for contributing their LP tokens, enhancing the liquidity of your DEX.
- **Seamless Token Creation**: With our one-click solution, anyone can create tokens on the TON blockchain, democratizing access to DeFi tools.
- **Merkle Distributor for Airdrops**: Distribute airdrops efficiently and securely, ensuring your tokens reach their intended recipients.


## Deployments

### MerkleDistributor


#### Deployment Steps
1. deployAirdropFactory
2. deployMerkeDistributor
3. claimMerkleDistributor

## Project structure

-   `contracts` - source code of all the smart contracts of the project and their dependencies.
-   `wrappers` - wrapper classes (implementing `Contract` from ton-core) for the contracts, including any [de]serialization primitives and compilation functions.
-   `tests` - tests for the contracts.
-   `scripts` - scripts used by the project, mainly the deployment scripts.

## How to use

### Build

`npx blueprint build` or `yarn blueprint build`

### Test

`npx blueprint test` or `yarn blueprint test`

### Deploy or run another script

`npx blueprint run` or `yarn blueprint run`

### Add a new contract

`npx blueprint create ContractName` or `yarn blueprint create ContractName`
