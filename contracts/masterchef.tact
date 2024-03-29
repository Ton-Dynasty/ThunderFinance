import "@stdlib/deploy";
import "./packages/token/jetton/JettonMaster.tact";
import "./packages/utils/data.fc";

@name(build_content_cell)
native build_content_cell(metadata_uri: Slice): Cell;

message AddPool{
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    allocPoint: Int;
}

message UpdatePool {
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
}


// Create User Pool 
message UserDeposit {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    amount: Int as coins;
    rewardDebt: Int;
}

struct PoolInfo {
    allocPoint: Int;
    lastRewardBlock: Int as uint256;
    accRewardPerShare: Int as coins;
    lpSupply: Int as coins;
    lpTokenAddress: Address;
}


struct UserInfo {
    amount: Int as coins;
    rewardDebt: Int;
}


message Withdraw {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    amount: Int as coins;
    beneficiary: Address;
}



message WithdrawInternal {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    amount: Int as coins;
    rewardDebt: Int;
    beneficiary: Address;
    sender: Address;
}

message WithdrawInternalReply {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    amount: Int as coins;
    sender: Address;
    rewardDebt: Int;
    beneficiary: Address;
}

message Harvest {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    beneficiary: Address; // the one who will receive the reward
}

message HarvestInternal {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    beneficiary: Address; // the one who will receive the reward
    accRewardPerShare: Int as coins;
}

message HarvestInternalReply {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    beneficiary: Address; // the one who will receive the reward
    reward: Int as coins;
    sender: Address;
}

message WithdrawAndHarvest {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    amount: Int as coins;
    beneficiary: Address;
}

message WithdrawAndHarvestInternal {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    amount: Int as coins;
    accRewardPerShare: Int as coins;
    beneficiary: Address;
    sender: Address;
}

message WithdrawAndHarvestReply {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    beneficiary: Address; // the one who will receive the reward
    reward: Int as coins;
    amount: Int as coins;
    sender: Address;
}

message Initialize {
    rewardJettonContent: Cell; // jetton content for reward token
}

message SetUp {
    owner: Address;
    seed: Int;
    rewardWallet: Address;
    rewardDecimal: Int;
    thunderMintWallet: Address;
    thunderMintJettonWallet: Address;
    metaData: Slice;
}

struct MasterChefData {
    owner: Address;
    rewardWallet: Address;
    rewardPerSecond: Int as coins;
    createdAt: Int as uint64;
    deadline: Int as uint64;
    isInitialized: Bool;
    totalAllocPoint: Int;
    tonForDevs: Int;
    jettonForDevs: Int;
}

message BuildMasterChef {
    owner: Address;
    thunderMintWallet: Address;
    thunderMintJettonWallet: Address;
    rewardWallet: Address;
    rewardDecimal: Int;
    metaData: Slice;
}


message DeployMasterChef {
    owner: Address;
    seed: Int;
}

const THUNDER_FEE: Int = ton("0.01"); // User have to pay the fee to ThunderMint

contract Kitchen with Deployable {
    owner: Address;
    seed: Int;
    init(owner: Address) {
        self.owner = owner;
        self.seed = 0;
    }

    receive(msg: BuildMasterChef) {
        let initCode: StateInit = self._calculateMasterChef(msg.owner,self.seed);
        send(SendParameters{
                to: contractAddress(initCode),
                value: 0,
                mode: SendRemainingValue,
                body: SetUp{
                    owner: msg.owner,
                    seed: self.seed,
                    thunderMintWallet: msg.thunderMintWallet,
                    thunderMintJettonWallet: msg.thunderMintJettonWallet,
                    rewardWallet: msg.rewardWallet,
                    rewardDecimal: msg.rewardDecimal,
                    metaData: msg.metaData
                }.toCell(),
                code: initCode.code,
                data: initCode.data
            }
        );
        self.seed = self.seed + 1;
    }

    inline fun _calculateMasterChef(owner: Address, seed: Int): StateInit {
        return initOf MasterChef(owner,seed);
    }

    // Get Methods
    // Get alarm address by alarm index
    get fun getMasterChefAddress(owner: Address, seed: Int): Address {
        let initCode: StateInit = self._calculateMasterChef(owner, seed);
        return contractAddress(initCode);
    }

    // Get Seed count
    get fun getSeed(): Int {
        return self.seed;
    }
}

contract MasterChef with Deployable {
    // State
    isInitialized: Bool = false;

    // Pool
    owner: Address;
    pools: map<Address, PoolInfo>;
    totalAllocPoint: Int = 0;

    // for reward jetton
    rewardWallet: Address;
    rewardDecimal: Int;
    rewardPerSecond: Int as coins = 0;
    createdAt: Int as uint64 = 0;
    deadline: Int as uint64 = 0;
    seed: Int;

    // For ThunderMint
    thunderMintWallet: Address;
    thunderMintJettonWallet: Address;
    Fee: Int = 3; // 0.3%
    jettonForDevs: Int = 0;
    tonForDevs: Int = 0;
    metaData: Cell;

    // initialize the contract with owner and reward jetton wallet address
    init(owner: Address, seed: Int) {
        self.owner = owner;
        self.isInitialized = false;
        self.rewardWallet = newAddress(0, 0);
        self.rewardDecimal = 6;
        self.seed = seed;
        self.thunderMintWallet = newAddress(0, 0);
        self.thunderMintJettonWallet = newAddress(0, 0);
        self.metaData = emptyCell();
        emit(DeployMasterChef{owner: owner, seed: seed}.toCell());
    }

    receive(msg: SetUp) {
        self.requireNotInitialized();
        require(self.rewardWallet == newAddress(0, 0), "reward wallet already set");
        self.rewardWallet = msg.rewardWallet;
        self.rewardDecimal = msg.rewardDecimal;
        self.thunderMintWallet = msg.thunderMintWallet;
        self.thunderMintJettonWallet = msg.thunderMintJettonWallet;
        self.metaData = build_content_cell(msg.metaData);   
    }

    receive(msg: AddPool){
        self.requireInitialized();
        require(sender() == self.owner, "only owner can add pool");
        require(self.pools.get(msg.lpTokenAddress) == null , "pool already exist");
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

    receive (msg: UpdatePool) {
        self.requireInitialized();
        self.updatePool(msg.lpTokenAddress);
    }
    
    receive(msg: JettonTransferNotification) {
        // context sender is from different kind of jetton wallet 
        let ctx: Context = context();
        // If not initialized, only accept reward jetton with Setup message payload
        if (!self.isInitialized) {
            require(ctx.sender == self.rewardWallet, "only reward jetton wallet can send message");
            require(!msg.forward_payload.dataEmpty(), "payload is empty");
            let totalReward: Int = msg.forward_payload.loadCoins();
            let deadline: Int = msg.forward_payload.loadUint(64);
            self.handleSetup(ctx, msg.amount, deadline, totalReward);
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
                    rewardDebt: pool.accRewardPerShare * msg.amount
                }.toCell(),
                code: initCode.code,
                data: initCode.data
            }
        );
    }


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
                mode: SendIgnoreErrors,
                bounce: true,
                body: WithdrawInternal{
                    queryId: msg.queryId,
                    lpTokenAddress: msg.lpTokenAddress,
                    amount: msg.amount,
                    rewardDebt: pool.accRewardPerShare * msg.amount / pow(10, 6),
                    beneficiary: msg.beneficiary,
                    sender: sender()
                }.toCell(),
                code: initCode.code,
                data: initCode.data
            }
        );
    }

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
                mode: SendIgnoreErrors,
                bounce: true,
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

    receive(msg: HarvestInternalReply) {
        let initCode: StateInit = self._calculateMiniChefInit(msg.sender);
        let expectedSender: Address = contractAddress(initCode);
        require(expectedSender == sender(), "unexpected sender");
        send(SendParameters{
                to: self.rewardWallet,
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

    receive(msg: WithdrawAndHarvestReply) {
        let initCode: StateInit = self._calculateMiniChefInit(msg.sender);
        let expectedSender: Address = contractAddress(initCode);
        require(expectedSender == sender(), "unexpected sender");

        // mint reward jetton to msg.beneficiary
        send(SendParameters{
                to: myAddress(),
                value: 0,
                mode: SendRemainingValue,
                body: JettonMint{
                    origin: myAddress(),
                    receiver: msg.beneficiary,
                    amount: msg.amount,
                    custom_payload: null,
                    forward_ton_amount: 0,
                    forward_payload: emptySlice()
                }.toCell()
            }
        );

        // Send amount to msg.beneficiary
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

    // Pay the fee to the devs
    receive("Collect") {
        if (self.jettonForDevs > 0) {
            send(SendParameters{
                    to: self.rewardWallet,
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
            mode: SendIgnoreErrors, 
            body: "Fees For Devs".asComment()
        });
        self.tonForDevs = 0;
    }

    // Internal Functions
    inline fun requireInitialized() {
        require(self.isInitialized, "contract not initialized");
    }

    inline fun requireNotInitialized() {
        require(!self.isInitialized, "contract already initialized");
    }

    inline fun handleSetup(ctx: Context, amount: Int, deadline: Int, totalReward: Int) {
        self.requireNotInitialized();
        self.createdAt = now();
        self.rewardPerSecond = totalReward / (deadline - self.createdAt);
        let rewardAmount: Int = totalReward;
        self.jettonForDevs = rewardAmount * self.Fee / 1000; // 0.3% fee
        // Have to transfer reward jetton and fee to the contract
        let expectedAmount: Int = rewardAmount + self.jettonForDevs;
        require(amount >= expectedAmount, "insufficient reward jetton amount");
        self.isInitialized = true;
    }


    fun updatePool(lpTokenAddress: Address) {
        require(self.pools.get(lpTokenAddress) != null , "pool not exists");
        let pool: PoolInfo = self.pools.get(lpTokenAddress)!!;
        let now: Int = now();
        if (now <= pool.lastRewardBlock){
            return;
        }

        if (pool.lpSupply > 0 ) {
            let reward: Int = (now - pool.lastRewardBlock) * self.rewardPerSecond;
            let rewardAmount: Int = pow(10, 6) * reward * pool.allocPoint / self.totalAllocPoint;
            pool.accRewardPerShare = pool.accRewardPerShare + (rewardAmount / pool.lpSupply);
        } 
        pool.lastRewardBlock = now;
        self.pools.set(lpTokenAddress, pool);
    }

    inline fun _calculateMiniChefInit(userAddress: Address): StateInit {
        return initOf MiniChef(userAddress);
    }

    // Get Methods

    // Get alarm address by alarm index
    get fun getMiniChefAddress(userAddress: Address): Address {
        let initCode: StateInit = self._calculateMiniChefInit(userAddress);
        return contractAddress(initCode);
    }

    get fun getMasterChefData(): MasterChefData {
        return MasterChefData{
            owner: self.owner,
            rewardWallet: self.rewardWallet,
            rewardPerSecond: self.rewardPerSecond,
            createdAt: self.createdAt,
            deadline: self.deadline,
            isInitialized: self.isInitialized,
            totalAllocPoint: self.totalAllocPoint,
            tonForDevs: self.tonForDevs,
            jettonForDevs: self.jettonForDevs
        };
    }

    get fun getPoolInfo(lpTokenAddress: Address): PoolInfo {
        require(self.pools.get(lpTokenAddress) != null , "pool not exists");
        return self.pools.get(lpTokenAddress)!!;
    }

    get fun getMetaData(): Cell {
        return self.metaData;
    }

}

contract MiniChef with Deployable {
    rewardDebt: Int;
    owner: Address;
    userInfo: map <Address, UserInfo>;
    masterChef: Address;
    
    init(owner: Address) {
        self.owner = owner; 
        self.masterChef = sender();  
        self.rewardDebt = 0;
    }

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
                rewardDebt: userInfo.rewardDebt,
                beneficiary: msg.beneficiary
            }.toCell()
        });
    }

    receive(msg: HarvestInternal) {
        require(sender() == self.masterChef, "only masterChef can harvest");
        let userInfo: UserInfo = self.userInfo.get(msg.lpTokenAddress)!!;
        let accumulatedReward: Int = userInfo.amount * msg.accRewardPerShare / pow(10, 6); 
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
    // Get Methods
    get fun getUserInfo(lpTokenAddress: Address): UserInfo {
        require(self.userInfo.get(lpTokenAddress) != null , "user not exists");
        return self.userInfo.get(lpTokenAddress)!!;
    }

}


// Master Chef
// receive(msg: WithdrawAndHarvest) {
//     self.requireInitialized();
//     // check if pool exists
//     require(self.pools.get(msg.lpTokenAddress) != null , "pool not exists");

//     let initCode: StateInit = self._calculateMiniChefInit(sender());
//     let pool: PoolInfo = self.pools.get(msg.lpTokenAddress)!!;
//     send(SendParameters{
//             to: contractAddress(initCode),
//             value: 0,
//             mode: SendRemainingValue,
//             bounce: true,
//             body: WithdrawAndHarvestInternal{
//                 queryId: msg.queryId,
//                 lpTokenAddress: msg.lpTokenAddress,
//                 amount: msg.amount,
//                 accRewardPerShare: pool.accRewardPerShare,
//                 beneficiary: msg.beneficiary,
//                 sender: sender()
//             }.toCell(),
//             code: initCode.code,
//             data: initCode.data
//         }
//     );
// }

// Mini Chef
// receive(msg: WithdrawAndHarvestInternal) {
//     require(sender() == self.masterChef, "only masterChef can harvest");
//     let userInfo: UserInfo = self.userInfo.get(msg.lpTokenAddress)!!;
//     let accumulatedReward: Int = userInfo.amount * msg.accRewardPerShare; 
//     let _pendingReward: Int = accumulatedReward - userInfo.rewardDebt;
//     if (_pendingReward <= 0) {
//         return;
//     }
//     userInfo.rewardDebt = accumulatedReward - msg.amount * msg.accRewardPerShare;
//     userInfo.amount = userInfo.amount - msg.amount;
//     self.userInfo.set(msg.lpTokenAddress, userInfo);

//     // Send WithdrawAndHarvestReply to MasterChef
//     send(SendParameters{
//         to: self.masterChef,
//         value: 0,
//         mode: SendRemainingValue,
//         body: WithdrawAndHarvestReply{
//             queryId: msg.queryId,
//             lpTokenAddress: msg.lpTokenAddress,
//             reward: _pendingReward,
//             amount: msg.amount,
//             sender: self.owner,
//             beneficiary: msg.beneficiary
//         }.toCell()
//     });

// }
