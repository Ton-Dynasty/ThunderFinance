// Messages

// For Jetton
message(0x0f8a7ea5) JettonTransfer {
    query_id: Int as uint64;                // arbitrary request number
    amount: Int as coins;                   // amount of jettons to transfer
    destination: Address;                   // address of the new owner of the jettons
    response_destination: Address;          // address where to send a response with confirmation of a successful transfer and the rest of the incoming message Toncoins.
    custom_payload: Cell?;                  // optional custom payload
    forward_ton_amount: Int as coins;       // the amount of nanotons to be sent to the destination address.
    forward_payload: Slice as remaining;    // optional custom data that should be sent to the destination address.
}

message(0x7362d09c) JettonTransferNotification {
    query_id: Int as uint64;                // arbitrary request number
    amount: Int as coins;                   // amount of jettons to transfer
    sender: Address;                        // address of the sender of the jettons
    forward_payload: Slice as remaining;    // optional custom payload
}
// For Kithcen Contract
message(0x89265822) BuildJettonMasterChef {
    owner: Address;                    // Owner of the MasterChef
    seed: Int as uint256;              // Seed for the MasterChef
    thunderMintJettonWallet: Address;  // ThunderMint Wallet address to collect the fee in Jetton
    mcRewardJettonWallet: Address;     // MasterChef Wallet address for reward jetton
    metaData: Slice;                   // MetaData for the MasterChef, such as name, image url and description
    totalReward: Int as coins;         // Total reward for the MasterChef
    deadline: Int as uint64;           // MasterChef distribution deadline
    startTime: Int as uint64;          // Start Mining Time
}

// For MasterChef Contract
message(0xc1c45a7c) Initialize {
    rewardJettonContent: Cell; // jetton content for reward token
}

message(0xf6cf7e6c) SetUpJettonMC {
    owner: Address;                   // Owner (deployer) of the MasterChef
    mcRewardJettonWallet: Address;    // MasterChef Wallet address for reward jetton
    thunderMintWallet: Address;       // ThunderMint Wallet address to collect the fee in TON
    thunderMintJettonWallet: Address; // ThunderMint Wallet address to collect the fee in Jetton
    metaData: Slice;                  // MetaData for the MasterChef
    totalReward: Int as coins;        // Total reward for the MasterChef
    deadline: Int as uint64;          // MasterChef distribution deadline
    startTime: Int as uint64;         // Start Mining Time
}
message(0x4b7d1ae4) AddPool{
    lpTokenAddress: Address;    // Pool Factory LP token Wallet address
    allocPoint: Int as uint16;  // How many allocation points assigned to this pool. (Total Allocation Point must be less than or equal to 10000)
}

message(0x5e653b7f) UpdatePool {
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
}

message(0x097bb407) Withdraw {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    amount: Int as coins;    // Amount of LP token user want to withdraw
    beneficiary: Address;    // The one who will receive the LP token
}

message(0xdc4c8b1a)WithdrawInternalReply {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    amount: Int as coins;    // Amount of LP token user want to withdraw
    sender: Address;         // The one who withdrawed the LP token
    beneficiary: Address;    // The one who will receive the LP token
}

message(0x8839dc49) Harvest {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    beneficiary: Address;    // the one who will receive the reward
}

message(0x952bcd19) HarvestInternalReply {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    beneficiary: Address;    // the one who will receive the reward
    reward: Int as coins;    // Amount of reward user will receive
    sender: Address;         // The one who harvested the reward
}

// For MiniChef Contract
message(0x6ba1d82e) UserDeposit {
    queryId: Int as uint64;  // To identify the request
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    amount: Int as coins;    // Amount of LP token user sended to the pool
    rewardDebt: Int;         // Users new reward debt after deposit (this value may be negative)
}

message(0x81732891) WithdrawInternal {
    queryId: Int as uint64;  // To identify the request
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    amount: Int as coins;    // Amount of LP token user want to withdraw
    rewardDebt: Int;         // Users new reward debt after withdraw
    beneficiary: Address;    // The one who will receive the LP token
    sender: Address;         // The one who withdrawed the LP token
}

message(0x925d0240) HarvestInternal {
    queryId: Int as uint64;          // To identify the request
    lpTokenAddress: Address;         // Pool Factory LP token Wallet address
    beneficiary: Address;            // the one who will receive the reward
    accRewardPerShare: Int as coins; // New accumulated reward per share after harvest
}

message (0x4212017c) WithdrawAndHarvest {
    queryId: Int as uint64;
    lpTokenAddress: Address;  // Pool Factory LP token Wallet address
    withdrawAmount: Int as coins;
    beneficiary: Address;
}

message (0x16a5d563) WithdrawAndHarvestInternal {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    withdrawAmount: Int as coins;
    accRewardPerShare: Int as coins;
    beneficiary: Address;
    sender: Address;
}

message (0xa1114e19) WithdrawAndHarvestReply {
    queryId: Int as uint64;       // To identify the request
    lpTokenAddress: Address;      // Pool Factory LP token Wallet address
    beneficiary: Address;         // the one who will receive the reward
    rewardAmount: Int as coins;   // The reward jetton amount that user will receive
    withdrawAmount: Int as coins; // The LP token amount that user will receive
    sender: Address;              // User who requested to withdraw and harvest
}

// TonMasterChef Messages
message(0x8bf38613) SetUpTonMC {
    owner: Address;              // Owner of the MasterChef
    thunderMintWallet: Address;  // ThunderMint Wallet address to collect the fee in TON
    metaData: Slice;             // MetaData for the MasterChef
    totalReward: Int as coins;   // Total reward for the MasterChef
    deadline: Int as uint64;     // MasterChef distribution deadline
    startTime: Int as uint64;          // Start Mining Time
}

message(0xd449b642) BuildTonMasterChef {
    owner: Address;            // Owner of the MasterChef
    seed: Int as uint256;      // Seed for the MasterChef
    metaData: Slice;           // MetaData for the MasterChef
    totalReward: Int as coins; // Total reward for the MasterChef
    deadline: Int as uint64;   // MasterChef distribution deadline
    startTime: Int as uint64;          // Start Mining Time
}

// Event: Deploy MasterChef
message(0xd1a0507d) DeployMasterChef {
    owner: Address;        // Owner of the MasterChef
    seed: Int as uint256;  // Seed for the MasterChef
}

// Structs

struct PoolInfo {
    allocPoint: Int;                 // How many allocation points assigned to this pool. (Total Allocation Point must be less than or equal to 10000)
    lastRewardBlock: Int as uint256; // Last block number that reward distribution occurs
    accRewardPerShare: Int as coins; // Accumulated reward per share
    lpSupply: Int as coins;          // Total amount of LP token that user deposited in the pool
    lpTokenAddress: Address;         // Pool Factory LP token Wallet address
}

struct UserInfo {
    amount: Int as coins; // How many LP tokens the user has provided
    rewardDebt: Int;      // Reward user received
}

struct MasterChefData {
    owner: Address;                 // Owner of the MasterChef
    mcRewardJettonWallet: Address;  // MasterChef Wallet address for reward jetton
    rewardPerSecond: Int as coins;  // Reward per second
    startTime: Int as uint64;       // // Start Mining Time
    deadline: Int as uint64;        // MasterChef distribution deadline
    isInitialized: Bool;            // MasterChef is initialized or not
    totalAllocPoint: Int as uint16; // Total allocation point
    feeForDevs: Int as coins;       // Jetton for ThunderMint
    pools: map<Address, PoolInfo>;  // Pool Info
    metaData: Cell;                 // MetaData for the MasterChef
    totalReward: Int as coins;      // Total reward
}


// Constants
const THUNDER_FEE: Int = ton("0.01"); // User have to pay the fee to ThunderMint
const ACC_PRECISION: Int = pow(10,12);   // Precision for the accumulated reward per share
const ZERO_ADDRESS: Address = address("0QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACkT");
const FEE_PERCENT_FOR_DEV: Int = 3;   // 0.3% of the reward will be given to the ThunderMint

// ERROR CODES
const ERROR_POOL_NOT_FOUND: Int = 1002;
const ERROR_WRONG_AUTH: Int = 1004;
const ERROR_NO_REWARD: Int = 1005;
const ERROR_NOT_INITIALIZED: Int = 1006;