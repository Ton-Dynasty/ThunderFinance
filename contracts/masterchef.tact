import "@stdlib/deploy";
import "./packages/token/jetton/JettonMaster.tact";
import "./packages/utils/data.fc";

// This function is used to build the content(meta data) cell for the MasterChef
@name(build_content_cell)
native build_content_cell(metadata_uri: Slice): Cell;

// Messages
// For Kithcen Contract
message(0x89265822) BuildMasterChef {
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

message(0xf6cf7e6c) SetUp {
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

const THUNDER_FEE: Int = ton("0.01"); // User have to pay the fee to ThunderMint
const ACC_PRECISION: Int = 1000000; // Precision for the accumulated reward per share

// Kithcen Contract (MasterChef Factory) is used to deploy the MasterChef
contract Kitchen with Deployable {
    owner: Address;
    version: Int;
    init(_owner: Address, _version: Int) {
        self.owner = _owner;
        self.version = _version;
    }

    // Deploy MasterChef
    receive(msg: BuildMasterChef) {
        let initCode: StateInit = self._calculateMasterChef(msg.owner,msg.seed);
        send(SendParameters{
                to: contractAddress(initCode),
                value: 0,
                mode: SendRemainingValue,
                body: SetUp{
                    owner: msg.owner,
                    thunderMintWallet: msg.thunderMintWallet,
                    thunderMintJettonWallet: msg.thunderMintJettonWallet,
                    mcRewardJettonWallet: msg.mcRewardJettonWallet,
                    metaData: msg.metaData,
                    totalReward: msg.totalReward,
                    deadline: msg.deadline
                }.toCell(),
                code: initCode.code,
                data: initCode.data
            }
        );
    }

    // Internal Functions //
    // Calculate MasterChef init code
    inline fun _calculateMasterChef(owner: Address, seed: Int): StateInit {
        return initOf MasterChef(owner,seed);
    }

    // Get Methods //
    // Get masterChef address by its owner and seed
    get fun getMasterChefAddress(owner: Address, seed: Int): Address {
        let initCode: StateInit = self._calculateMasterChef(owner, seed);
        return contractAddress(initCode);
    }
}

// MasterChef Contract: Users deposit, withdraw and harvest their LP tokens in this contract
contract MasterChef with Deployable {
    // State
    isInitialized: Bool = false;

    // Pool Info
    owner: Address;
    pools: map<Address, PoolInfo>;
    totalAllocPoint: Int = 0;
    createdAt: Int as uint64 = 0;
    deadline: Int as uint64 = 0;
    metaData: Cell;

    // for reward jetton
    mcRewardJettonWallet: Address;
    rewardPerSecond: Int as coins = 0;
    totalReward: Int = 0;


    // For ThunderMint
    thunderMintWallet: Address;
    thunderMintJettonWallet: Address;
    Fee: Int = 3; // 0.3%
    jettonForDevs: Int = 0;
    tonForDevs: Int = 0;

    // initialize the contract with owner and reward jetton wallet address
    init(owner: Address, _seed: Int) {
        self.owner = owner;
        self.isInitialized = false;
        self.mcRewardJettonWallet = newAddress(0, 0);
        self.thunderMintWallet = newAddress(0, 0);
        self.thunderMintJettonWallet = newAddress(0, 0);
        self.metaData = emptyCell();
        emit(DeployMasterChef{owner: owner, seed: _seed}.toCell());
    }

    // Kitchen contract will send this message to initialize the MasterChef
    receive(msg: SetUp) {
        self.requireNotInitialized();
        require(self.mcRewardJettonWallet == newAddress(0, 0), "reward wallet already set");
        self.mcRewardJettonWallet = msg.mcRewardJettonWallet;
        self.thunderMintWallet = msg.thunderMintWallet;
        self.thunderMintJettonWallet = msg.thunderMintJettonWallet;
        self.metaData = build_content_cell(msg.metaData);
        self.totalReward = msg.totalReward;
        self.deadline = msg.deadline;
    }

    // Owner send AddPool message to add a new pool
    receive(msg: AddPool){
        self.requireInitialized();
        require(sender() == self.owner, "only owner can add pool");
        require(self.pools.get(msg.lpTokenAddress) == null , "pool already exist");
        require(self.totalAllocPoint + msg.allocPoint <= 10000, "total alloc point exceeds 10000");
        self.totalAllocPoint = self.totalAllocPoint + msg.allocPoint;
        let poolInfo: PoolInfo = PoolInfo{
            allocPoint: msg.allocPoint,
            lastRewardBlock: now(),
            accRewardPerShare: 0,
            lpSupply: 0,
            lpTokenAddress: msg.lpTokenAddress
        };
        self.pools.set(msg.lpTokenAddress,poolInfo);
    }

    // Anyone can send this message to update the pool, recalculate the reward per share
    receive (msg: UpdatePool) {
        self.requireInitialized();
        self.updatePool(msg.lpTokenAddress);
    }
    
    // Owner has to send Reward Jetton to the MasterChef first, so that MasterChef can distribute the reward to the users
    // Users send JettonTransferNotification to the MasterChef to deposit their LP tokens
    receive(msg: JettonTransferNotification) {
        // context sender is from different kind of jetton wallet 
        let ctx: Context = context();
        // If not initialized, only accept reward jetton with Setup message payload
        if (!self.isInitialized) {
            require(ctx.sender == self.mcRewardJettonWallet, "only reward jetton wallet can send message");
            require(msg.sender == self.owner, "only owner can send setup message");
            self.handleSetup(ctx, msg.amount);
            return;
        }

        // check if pool exists
        require(self.pools.get(ctx.sender) != null , "pool not exists");

        // transfer from masterchef jetton wallet
        self.updatePool(ctx.sender);

        // load address from forward payload, if it does not exist, use msg.sender
        let beneficiary: Address = msg.sender;
        let payload: Slice = msg.forward_payload;
        if (!payload.dataEmpty()) {
            beneficiary = msg.sender;
        }

        let initCode: StateInit = self._calculateMiniChefInit(beneficiary);
        let pool: PoolInfo = self.pools.get(ctx.sender)!!;
        pool.lpSupply = pool.lpSupply + msg.amount;
        self.pools.set(ctx.sender, pool);
        send(SendParameters{
                to: contractAddress(initCode),
                value: 0,
                mode: SendRemainingValue,
                body: UserDeposit{
                    queryId: msg.query_id,
                    lpTokenAddress: ctx.sender,
                    amount: msg.amount,
                    rewardDebt: pool.accRewardPerShare * msg.amount / ACC_PRECISION
                }.toCell(),
                code: initCode.code,
                data: initCode.data
            }
        );
    }

    // User can send this message to withdraw their LP tokens
    receive(msg: Withdraw) {
        self.requireInitialized();
        let ctx: Context = context();
        let remainTon: Int = ctx.value - THUNDER_FEE;
        self.tonForDevs = self.tonForDevs + THUNDER_FEE;
        // check if pool exists
        require(self.pools.get(msg.lpTokenAddress) != null , "pool not exists");
        self.updatePool(msg.lpTokenAddress);

        let initCode: StateInit = self._calculateMiniChefInit(sender());
        let pool: PoolInfo = self.pools.get(msg.lpTokenAddress)!!;
        send(SendParameters{
                to: contractAddress(initCode),
                value: remainTon,
                mode: 0,
                body: WithdrawInternal{
                    queryId: msg.queryId,
                    lpTokenAddress: msg.lpTokenAddress,
                    amount: msg.amount,
                    rewardDebt: pool.accRewardPerShare * msg.amount / ACC_PRECISION,
                    beneficiary: msg.beneficiary,
                    sender: sender()
                }.toCell(),
                code: initCode.code,
                data: initCode.data
            }
        );
    }

    // MiniChef will send this message to ask MasterChef to withdraw LP tokens
    receive(msg: WithdrawInternalReply) {
        let initCode: StateInit = self._calculateMiniChefInit(msg.sender);
        let expectedSender: Address = contractAddress(initCode);
        require(expectedSender == sender(), "unexpected sender");

        let pool: PoolInfo = self.pools.get(msg.lpTokenAddress)!!;
        send(SendParameters{
            to: pool.lpTokenAddress,
            value: 0,
            mode: SendRemainingValue,
            body: JettonTransfer{
                query_id: 0,
                amount: msg.amount,
                destination: msg.beneficiary,
                response_destination: msg.beneficiary,
                custom_payload: null,
                forward_ton_amount: 0,
                forward_payload: emptySlice()
            }.toCell()
        });
        
    }

    // User can send this message to harvest their reward
    receive(msg: Harvest) {
        self.requireInitialized();
        require(self.pools.get(msg.lpTokenAddress) != null , "pool not exists");
        let ctx: Context = context();
        let remainTon: Int = ctx.value - THUNDER_FEE;
        self.tonForDevs = self.tonForDevs + THUNDER_FEE;
        let initCode: StateInit = self._calculateMiniChefInit(sender());
        self.updatePool(msg.lpTokenAddress);
        let pool: PoolInfo = self.pools.get(msg.lpTokenAddress)!!;
        send(SendParameters{
                to: contractAddress(initCode),
                value: remainTon,
                mode: 0,
                body: HarvestInternal{
                    queryId: msg.queryId,
                    lpTokenAddress: msg.lpTokenAddress,
                    accRewardPerShare: pool.accRewardPerShare,
                    beneficiary: msg.beneficiary
                }.toCell(),
                code: initCode.code,
                data: initCode.data
            }
        );

    }

    // MiniChef will send this message to ask MasterChef to send reward
    receive(msg: HarvestInternalReply) {
        let initCode: StateInit = self._calculateMiniChefInit(msg.sender);
        let expectedSender: Address = contractAddress(initCode);
        require(expectedSender == sender(), "unexpected sender");
        send(SendParameters{
                to: self.mcRewardJettonWallet,
                value: 0,
                mode: SendRemainingValue,
                body: JettonTransfer{
                    query_id: 0,
                    amount: msg.reward,
                    destination: msg.beneficiary,
                    response_destination: msg.beneficiary,
                    custom_payload: null,
                    forward_ton_amount: 0,
                    forward_payload: emptySlice()
            }.toCell()
            }
        );

    }

    // Pay the fee to the devs
    receive("Collect") {
        // Reward jetton for devs can only be sent to ThunderMint once
        if (self.jettonForDevs > 0) {
            send(SendParameters{
                    to: self.mcRewardJettonWallet,
                    value: self.tonForDevs,
                    mode: SendRemainingValue,
                    body: JettonTransfer{
                        query_id: 0,
                        amount: self.jettonForDevs,
                        destination: self.thunderMintWallet,
                        response_destination: self.thunderMintWallet,
                        custom_payload: null,
                        forward_ton_amount: 0,
                        forward_payload: emptySlice()
                }.toCell()
            });
            self.tonForDevs = 0;
            self.jettonForDevs = 0;
            return;
        }
        // Only send ton to devs
        send(SendParameters{
            to: self.thunderMintWallet, 
            value: self.tonForDevs,
            mode: 0, 
            body: "Fees For Devs".asComment()
        });
        self.tonForDevs = 0;
    }

    // Internal Functions //

    // Check if the contract is initialized
    inline fun requireInitialized() {
        require(self.isInitialized, "contract not initialized");
    }

    // Check if the contract is not initialized
    inline fun requireNotInitialized() {
        require(!self.isInitialized, "contract already initialized");
    }

    // Handle the setup message which is used to initialize the contract
    inline fun handleSetup(ctx: Context, amount: Int) {
        self.requireNotInitialized();
        self.createdAt = now();
        self.rewardPerSecond = self.totalReward / (self.deadline - self.createdAt);
        require(self.rewardPerSecond > 0, "reward per second must be greater than 0");
        self.jettonForDevs = self.totalReward * self.Fee / 1000; // 0.3% fee
        // Have to transfer reward jetton and fee to the contract
        let expectedAmount: Int = self.totalReward + self.jettonForDevs;
        require(amount >= expectedAmount, "insufficient reward jetton amount");
        self.isInitialized = true;
    }

    // Update the pool, recalculate the reward per share
    fun updatePool(lpTokenAddress: Address) {
        require(self.pools.get(lpTokenAddress) != null , "pool not exists");
        let pool: PoolInfo = self.pools.get(lpTokenAddress)!!;
        let now: Int = now();
        // If the deadline is passed, set now to deadline, so that no more reward will be distributed
        if (now > self.deadline) {
            now = self.deadline;
        }
        if (now <= pool.lastRewardBlock){
            return;
        }

        if (pool.lpSupply > 0 ) {
            let reward: Int = (now - pool.lastRewardBlock) * self.rewardPerSecond;
            let rewardAmount: Int = ACC_PRECISION * reward * pool.allocPoint / self.totalAllocPoint;
            pool.accRewardPerShare = pool.accRewardPerShare + (rewardAmount / pool.lpSupply);
        } 
        pool.lastRewardBlock = now;
        self.pools.set(lpTokenAddress, pool);
    }

    // Calculate MiniChef init code
    inline fun _calculateMiniChefInit(userAddress: Address): StateInit {
        return initOf MiniChef(userAddress,myAddress());
    }

    // Get Methods // 

    // Get minichef address by user address
    get fun getMiniChefAddress(userAddress: Address): Address {
        let initCode: StateInit = self._calculateMiniChefInit(userAddress);
        return contractAddress(initCode);
    }

    // Get MasterChef Data
    get fun getMasterChefData(): MasterChefData {
        return MasterChefData{
            owner: self.owner,
            mcRewardJettonWallet: self.mcRewardJettonWallet,
            rewardPerSecond: self.rewardPerSecond,
            createdAt: self.createdAt,
            deadline: self.deadline,
            isInitialized: self.isInitialized,
            totalAllocPoint: self.totalAllocPoint,
            tonForDevs: self.tonForDevs,
            jettonForDevs: self.jettonForDevs,
            pools: self.pools,
            metaData: self.metaData,
            totalReward: self.totalReward
        };
    }

    // Get Pool Info
    get fun getPoolInfo(lpTokenAddress: Address): PoolInfo {
        require(self.pools.get(lpTokenAddress) != null , "pool not exists");
        return self.pools.get(lpTokenAddress)!!;
    }

    // Get MetaData
    get fun getMetaData(): Cell {
        return self.metaData;
    }
}

contract MiniChef with Deployable {
    rewardDebt: Int;
    owner: Address;
    userInfo: map <Address, UserInfo>;
    masterChef: Address;
    
    init(owner: Address, masterchef: Address) {
        self.owner = owner; 
        self.masterChef = masterchef;  
        self.rewardDebt = 0;
    }

    // MasterChef will send this message to MiniChef to record the deposit at user info
    receive(msg: UserDeposit) {
        require(sender() == self.masterChef, "only masterChef can deposit");
        if(self.userInfo.get(msg.lpTokenAddress) == null) {
            self.userInfo.set(msg.lpTokenAddress, UserInfo{amount: 0, rewardDebt: 0});
        }
        let userInfo: UserInfo = self.userInfo.get(msg.lpTokenAddress)!!;
        userInfo.amount  = userInfo.amount + msg.amount;
        userInfo.rewardDebt = userInfo.rewardDebt + msg.rewardDebt; 
        self.userInfo.set(msg.lpTokenAddress, userInfo);
    }
    

    // MasterChef will send this message to MiniChef to comfrim the withdraw and send WithdrawInternalReply to MasterChef to complete the withdraw
    receive(msg: WithdrawInternal) {
        require(sender() == self.masterChef, "only masterChef can withdraw");
        let userInfo: UserInfo = self.userInfo.get(msg.lpTokenAddress)!!;
        require(userInfo.amount >= msg.amount, "insufficient balance");

        userInfo.amount = userInfo.amount - msg.amount;
        userInfo.rewardDebt = userInfo.rewardDebt - msg.rewardDebt; 

        self.userInfo.set(msg.lpTokenAddress, userInfo);

        send(SendParameters{
            to: self.masterChef,
            value: 0,
            mode: SendRemainingValue,
            body: WithdrawInternalReply{
                queryId: msg.queryId,
                lpTokenAddress: msg.lpTokenAddress,
                amount: msg.amount,
                sender: msg.sender,
                beneficiary: msg.beneficiary
            }.toCell()
        });
    }

    // MasterChef will send this message to MiniChef to comfrim the harvest and send HarvestInternalReply to MasterChef to complete the harvest
    receive(msg: HarvestInternal) {
        require(sender() == self.masterChef, "only masterChef can harvest");
        let userInfo: UserInfo = self.userInfo.get(msg.lpTokenAddress)!!;
        let accumulatedReward: Int = userInfo.amount * msg.accRewardPerShare / ACC_PRECISION; 
        let _pendingReward: Int = accumulatedReward - userInfo.rewardDebt;
        if (_pendingReward <= 0) {
            return;
        }
        userInfo.rewardDebt = accumulatedReward;
        self.userInfo.set(msg.lpTokenAddress, userInfo);
        // Send pending reward ammount to MasterChef, and then MasterChef will send it to the user
        send(SendParameters{
            to: self.masterChef,
            value: 0,
            mode: SendRemainingValue,
            body: HarvestInternalReply{
                queryId: msg.queryId,
                lpTokenAddress: msg.lpTokenAddress,
                reward: _pendingReward,
                sender: self.owner,
                beneficiary: msg.beneficiary
            }.toCell()
        });
    
    }
    // Get Methods // 

    // Get User Info
    get fun getUserInfo(lpTokenAddress: Address): UserInfo {
        require(self.userInfo.get(lpTokenAddress) != null , "user not exists");
        return self.userInfo.get(lpTokenAddress)!!;
    }

    // Get Owner of the MiniChef
    get fun getOwner(): Address {
        return self.owner;
    }

    // Get MasterChef Address
    get fun getMasterChef(): Address {
        return self.masterChef;
    }

}