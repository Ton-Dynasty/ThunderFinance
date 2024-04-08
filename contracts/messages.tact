// Messages

// For Kithcen Contract
message(0x89265822) BuildJettonMasterChef {
    owner: Address; // Owner of the MasterChef
    seed: Int as uint256; // Seed for the MasterChef
    thunderMintWallet: Address; // ThunderMint Wallet address to collect the fee in TON
    thunderMintJettonWallet: Address; // ThunderMint Wallet address to collect the fee in Jetton
    mcRewardJettonWallet: Address; // MasterChef Wallet address for reward jetton
    metaData: Slice; // MetaData for the MasterChef
    totalReward: Int as coins; // Total reward for the MasterChef
    deadline: Int as uint64; // MasterChef distribution deadline
}

// For MasterChef Contract
message(0xc1c45a7c) Initialize {
    rewardJettonContent: Cell; // jetton content for reward token
}

message(0xf6cf7e6c) SetUpJettonMC {
    owner: Address; // Owner of the MasterChef
    mcRewardJettonWallet: Address; // MasterChef Wallet address for reward jetton
    thunderMintWallet: Address; // ThunderMint Wallet address to collect the fee in TON
    thunderMintJettonWallet: Address; // ThunderMint Wallet address to collect the fee in Jetton
    metaData: Slice; // MetaData for the MasterChef
    totalReward: Int as coins; // Total reward for the MasterChef
    deadline: Int as uint64; // MasterChef distribution deadline
}
message(0x4b7d1ae4) AddPool{
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    allocPoint: Int; // How many allocation points assigned to this pool. (Total Allocation Point must be less than or equal to 10000)
}

message(0x5e653b7f) UpdatePool {
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
}

message(0x097bb407) Withdraw {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    amount: Int as coins; // Amount of LP token user want to withdraw
    beneficiary: Address; // The one who will receive the LP token
}

message(0xdc4c8b1a)WithdrawInternalReply {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    amount: Int as coins; // Amount of LP token user want to withdraw
    sender: Address; // The one who withdrawed the LP token
    beneficiary: Address; // The one who will receive the LP token
}

message(0x8839dc49) Harvest {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    beneficiary: Address; // the one who will receive the reward
}

message(0x952bcd19) HarvestInternalReply {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    beneficiary: Address; // the one who will receive the reward
    reward: Int as coins; // Amount of reward user will receive
    sender: Address; // The one who harvested the reward
}

// For MiniChef Contract
message(0x6ba1d82e) UserDeposit {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    amount: Int as coins; // Amount of LP token user sended to the pool
    rewardDebt: Int; // Users new reward debt after deposit
}

message(0x81732891) WithdrawInternal {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    amount: Int as coins; // Amount of LP token user want to withdraw
    rewardDebt: Int; // Users new reward debt after withdraw
    beneficiary: Address; // The one who will receive the LP token
    sender: Address; // The one who withdrawed the LP token
}

message(0x925d0240) HarvestInternal {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    beneficiary: Address; // the one who will receive the reward
    accRewardPerShare: Int as coins; // New accumulated reward per share after harvest
}

// TonMasterChef Messages
message(0x8bf38613) SetUpForTonMC {
    owner: Address; // Owner of the MasterChef
    thunderMintWallet: Address; // ThunderMint Wallet address to collect the fee in TON
    metaData: Slice; // MetaData for the MasterChef
    totalReward: Int as coins; // Total reward for the MasterChef
    deadline: Int as uint64; // MasterChef distribution deadline
}

message(0xd449b642) BuildTonMasterChef {
    owner: Address; // Owner of the MasterChef
    seed: Int as uint256; // Seed for the MasterChef
    thunderMintWallet: Address; // ThunderMint Wallet address to collect the fee in TON
    metaData: Slice; // MetaData for the MasterChef
    totalReward: Int as coins; // Total reward for the MasterChef
    deadline: Int as uint64; // MasterChef distribution deadline
}

// Event: Deploy MasterChef
message(0xd1a0507d) DeployMasterChef {
    owner: Address; // Owner of the MasterChef
    seed: Int as uint256; // Seed for the MasterChef
}

// Structs

struct PoolInfo {
    allocPoint: Int; // How many allocation points assigned to this pool. (Total Allocation Point must be less than or equal to 10000)
    lastRewardBlock: Int as uint256; // Last block number that reward distribution occurs
    accRewardPerShare: Int as coins; // Accumulated reward per share
    lpSupply: Int as coins; // Total amount of LP token that user deposited in the pool
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
}

struct UserInfo {
    amount: Int as coins; // How many LP tokens the user has provided
    rewardDebt: Int; // Reward user received
}

struct MasterChefData {
    owner: Address; // Owner of the MasterChef
    mcRewardJettonWallet: Address; // MasterChef Wallet address for reward jetton
    rewardPerSecond: Int as coins; // Reward per second
    createdAt: Int as uint64; // MasterChef Created at block number
    deadline: Int as uint64; // MasterChef distribution deadline
    isInitialized: Bool; // MasterChef is initialized or not
    totalAllocPoint: Int; // Total allocation point
    tonForDevs: Int; // TON for ThunderMint
    jettonForDevs: Int; // Jetton for ThunderMint
    pools: map<Address, PoolInfo>; // Pool Info
    metaData: Cell; // MetaData for the MasterChef
    totalReward: Int; // Total reward
}


// Constants
const STORAGE_FEES: Int = ton("0.001"); // TODO: Remove this
const THUNDER_FEE: Int = ton("0.01"); // User have to pay the fee to ThunderMint
const ACC_PRECISION: Int = 1000000; // Precision for the accumulated reward per share

// ERROR CODES
const ERROR_NOT_INITIALIZED: Int = 0;
const ERROR_NOT_ENOUGH_REWARD: Int = 1;
const ERROR_POOL_NOT_FOUND: Int = 2;
const ERROR_RPS_UNDER_ZERO: Int = 3;
const ERROR_WRONG_AUTH: Int = 4;
const ERROR_NO_REWARD: Int = 5;