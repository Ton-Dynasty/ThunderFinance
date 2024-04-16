import "@stdlib/deploy";
import "./packages/utils/data.fc";
import "./messages.tact";
import "./mini_chef.tact";

// This function is used to build the content(meta data) cell for the MasterChef
@name(build_content_cell)
native build_content_cell(metadata_uri: Slice): Cell;

// MasterChef Contract Trait: This contract will have basic fuctions and receive messages to interact with the MasterChef contract 
trait MasterChef {
    // Initializer
    // Only the owner can initialize the contract with the basic setup
    // The contract should be initialized before any other operations 
    isInitialized: Bool = false;

    // Pool Info
    owner: Address;                    // The owner of this contract, may be the deployer
    pools: map<Address, PoolInfo>;     // All the pools in the MasterChef, the key is the "LP Jetton Wallet" address
    totalAllocPoint: Int;              // Total alloc point (uint16) should be less than or equal to 10000, means the weight of the pools
    createdAt: Int = 0;                // The time when the contract is created (initialize in basic setup)
    deadline: Int = 0;                 // The time when the reward distribution ends (initialize in basic setup)
    metaData: Cell;                    // The meta data of the contract, such as the name, image url, description, etc.
    startTime: Int = 0;                // The time when the reward distribution starts (initialize in basic setup)

    // For Reward jetton
    rewardPerSecond: Int = 0;          // The reward per second (coins), so called RPS.
    totalReward: Int = 0;              // The total distribution reward (initialize in basic setup)


    // For ThunderMint
    thunderMintWallet: Address;        // The owner address of Kitchen contract (ThunderMint)
    feeForDevs: Int = 0;               // The fee for the developers

    // Owner send AddPool message to add a new pool, so that users can deposit their LP tokens
    // NOTE that all the pools should have a total alloc point less than or equal to 10000
    receive(msg: AddPool){
        self.requireInitialized();
        require(sender() == self.owner, "only owner can add pool");
        require(self.pools.get(msg.lpTokenAddress) == null , "pool already exist");
        require(self.totalAllocPoint + msg.allocPoint <= 10000, "total alloc point exceeds 10000");
        self.totalAllocPoint = self.totalAllocPoint + msg.allocPoint;
        let poolInfo: PoolInfo = PoolInfo{
            allocPoint: msg.allocPoint,
            lastRewardBlock: self.startTime,
            accRewardPerShare: 0,
            lpSupply: 0,
            lpTokenAddress: msg.lpTokenAddress
        };
        self.pools.set(msg.lpTokenAddress, poolInfo);
    }

    // Anyone can send this message to update the pool, recalculate the reward per share
    receive (msg: UpdatePool) {
        self.requireInitialized();
        self.updatePool(msg.lpTokenAddress);
    }

    // User can send this message to withdraw their LP tokens
    receive(msg: Withdraw) {
        self.userOpSetUp(msg.lpTokenAddress);
        let ctx: Context = context();
        let remainTon: Int = ctx.value - THUNDER_FEE;

        let initCode: StateInit = self._calculateMiniChefInit(ctx.sender);
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
                    sender: ctx.sender
                }.toCell()
            }
        );
    }

    // Users' MiniChef will send this message to ask MasterChef to withdraw LP tokens
    receive(msg: WithdrawInternalReply) {
        self.requireMiniChef(msg.sender);
        let pool: PoolInfo = self.pools.get(msg.lpTokenAddress)!!;
        self.sendJetton(pool.lpTokenAddress, 0, msg.amount, msg.beneficiary, msg.beneficiary, SendRemainingValue);
    }

    // User can send this message to harvest their reward
    receive(msg: Harvest) {
        self.userOpSetUp(msg.lpTokenAddress);
        let ctx: Context = context();
        let remainTon: Int = ctx.value - THUNDER_FEE;

        let initCode: StateInit = self._calculateMiniChefInit(sender());
        let pool: PoolInfo = self.pools.get(msg.lpTokenAddress)!!;

        // Send the info of accRewardPerShare to the user's MiniChef, so that MiniChef can calculate the reward
        send(SendParameters{
                to: contractAddress(initCode),
                value: remainTon,
                mode: 0,
                body: HarvestInternal{
                    queryId: msg.queryId,
                    lpTokenAddress: msg.lpTokenAddress,
                    accRewardPerShare: pool.accRewardPerShare,
                    beneficiary: msg.beneficiary
                }.toCell()
            }
        );

    }

    // Withdraw and Harvest in one step
    receive(msg: WithdrawAndHarvest) {
        self.userOpSetUp(msg.lpTokenAddress);
        let ctx: Context = context();
        let remainTon: Int = ctx.value - THUNDER_FEE;

        let initCode: StateInit = self._calculateMiniChefInit(sender());
        let pool: PoolInfo = self.pools.get(msg.lpTokenAddress)!!;
        send(SendParameters{
                to: contractAddress(initCode),
                value: remainTon,
                mode: 0,
                bounce: true,
                body: WithdrawAndHarvestInternal{
                    queryId: msg.queryId,
                    lpTokenAddress: msg.lpTokenAddress,
                    withdrawAmount: msg.withdrawAmount,
                    accRewardPerShare: pool.accRewardPerShare,
                    beneficiary: msg.beneficiary,
                    sender: sender()
                }.toCell(),
                code: initCode.code,
                data: initCode.data
            });
    }

    // Internal Functions //

    // Baise setup function
    inline fun basicSetUp(_thunderMintWallet: Address, _metaData: Slice, _totalReward: Int, _deadline: Int, _startTime: Int) {
        self.thunderMintWallet = _thunderMintWallet;
        self.metaData = build_content_cell(_metaData);
        self.totalReward = _totalReward;
        self.deadline = _deadline;
        self.startTime = _startTime;
        self.createdAt = now();
        self.rewardPerSecond = self.totalReward / (self.deadline - self.startTime);
    }

    // Check contract is initialized and pool exists and then Update the pool
    inline fun userOpSetUp(lpTokenAddress: Address) {
        self.requireInitialized();
        require(now() > self.startTime, "reward distribution not started");
        // check if pool exists
        require(self.pools.get(lpTokenAddress) != null , "pool not exists");

        // should update accRewardPerShare first and get the pool info
        self.updatePool(lpTokenAddress);
    }

    // Check if the sender is the MiniChef
    inline fun requireMiniChef(sender: Address) {
        let initCode: StateInit = self._calculateMiniChefInit(sender);
        let expectedSender: Address = contractAddress(initCode);
        require(expectedSender == sender(), "unexpected sender");
    }

    // Check if the contract is initialized
    inline fun requireInitialized() {
        require(self.isInitialized, "contract not initialized");
    }

    // Deploy MiniChef Contract for the user
    inline fun userDeposit(msg: JettonTransferNotification, ctx: Context) {        
        // Update the pool
        self.updatePool(ctx.sender);
        let pool: PoolInfo = self.pools.get(ctx.sender)!!;
        pool.lpSupply = pool.lpSupply + msg.amount;
        self.pools.set(ctx.sender, pool);
        // Get the MiniChef init code for the user
        let initCode: StateInit = self._calculateMiniChefInit(msg.sender);
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

    // Update the pool, recalculate the reward per share
    inline fun updatePool(lpTokenAddress: Address) {
        require(self.pools.get(lpTokenAddress) != null , "pool not exists");
        let pool: PoolInfo = self.pools.get(lpTokenAddress)!!;
        // The time should be the minimum of now and deadline
        let _time: Int = min(now(), self.deadline);

        // If the last reward block is greater than now,
        // or the last reward block is equal to pool.lastRewardBlock, return
        if (_time <= pool.lastRewardBlock){
            return;
        }
        // Calculate the reward
        if (pool.lpSupply > 0 ) {
            let reward: Int = (_time - pool.lastRewardBlock) * self.rewardPerSecond;
            let rewardAmount: Int = ACC_PRECISION * reward * pool.allocPoint / self.totalAllocPoint;
            pool.accRewardPerShare = pool.accRewardPerShare + (rewardAmount / pool.lpSupply);
        } 
        pool.lastRewardBlock = _time;
        self.pools.set(lpTokenAddress, pool);
    }

    // Send Jetton
    inline fun sendJetton(_to: Address, _tonValue: Int, _amount: Int, _destination: Address, _response_destination: Address, _mode: Int) {
        // Send Jetton back to the sender        
        send(SendParameters{
            to: _to,
            value: _tonValue,
            mode: _mode,
            body: JettonTransfer{
                query_id: 0,
                amount: _amount,
                destination: _destination,
                response_destination: _response_destination,
                custom_payload: null,
                forward_ton_amount: 0,
                forward_payload: beginCell().storeUint(1,1).endCell().asSlice() // Have to put 1 bit, so that we can pass jetton minter exit code 708
            }.toCell()    
        });
    }


    // Send TON
    inline fun sendTon(_to: Address, _value: Int, _mode: Int) {
        send(SendParameters{
            to: _to,
            value: _value,
            mode: _mode,
            body: "MasterChef Send Back TON".asComment()
        });
    }

    // Calculate MiniChef init code
    inline fun _calculateMiniChefInit(userAddress: Address): StateInit {
        return initOf MiniChef(userAddress, myAddress());
    }

    // Get Methods // 

    // Get minichef address by user address
    get fun getMiniChefAddress(userAddress: Address): Address {
        let initCode: StateInit = self._calculateMiniChefInit(userAddress);
        return contractAddress(initCode);
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

    // Get AccRewardPerShare
    get fun getAccRewardPerShare(lpTokenAddress: Address): Int {
        require(self.pools.get(lpTokenAddress) != null , "pool not exists");
        let pool: PoolInfo = self.pools.get(lpTokenAddress)!!;
        // The time should be the minimum of now and deadline
        let _time: Int = min(now(), self.deadline);

        // If the last reward block is greater than now,
        // or the last reward block is equal to pool.lastRewardBlock, return
        if (_time <= pool.lastRewardBlock){
            return pool.accRewardPerShare;
        }

        // Calculate the reward
        if (pool.lpSupply > 0 ) {
            let reward: Int = (_time - pool.lastRewardBlock) * self.rewardPerSecond;
            let rewardAmount: Int = ACC_PRECISION * reward * pool.allocPoint / self.totalAllocPoint;
            return pool.accRewardPerShare + (rewardAmount / pool.lpSupply);
        } 
        return 0;
    }
}