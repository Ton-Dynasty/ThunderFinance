import "@stdlib/deploy";
import "./packages/token/jetton/JettonMaster.tact";
import "./packages/utils/data.fc";
import "./messages.tact";
import "./mini_chef.tact";

// This function is used to build the content(meta data) cell for the MasterChef
@name(build_content_cell)
native build_content_cell(metadata_uri: Slice): Cell;

// MasterChef Contract: Users deposit, withdraw and harvest their LP tokens in this contract
contract JettonMasterChef with Deployable {
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
            self.deadline = 0;
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