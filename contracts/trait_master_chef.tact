import "@stdlib/deploy";
import "./packages/token/jetton/JettonMaster.tact";
import "./packages/utils/data.fc";
import "./messages.tact";
import "./mini_chef.tact";

// This function is used to build the content(meta data) cell for the MasterChef
@name(build_content_cell)
native build_content_cell(metadata_uri: Slice): Cell;

// MasterChef Contract: Users deposit, withdraw and harvest their LP tokens in this contract
trait MasterChef {
    // State
    isInitialized: Bool = false;

    // Pool Info
    owner: Address;
    pools: map<Address, PoolInfo>;
    totalAllocPoint: Int = 0;
    createdAt: Int = 0;
    deadline: Int = 0;
    metaData: Cell;

    // for reward jetton
    rewardPerSecond: Int = 0;
    totalReward: Int = 0;


    // For ThunderMint
    thunderMintWallet: Address;
    Fee: Int = 3; // 0.3%
    tonForDevs: Int = 0;

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
        self.sendJetton(pool.lpTokenAddress, msg.amount, msg.beneficiary, msg.beneficiary);
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

    // Internal Functions //

    // Check if the contract is initialized
    inline fun requireInitialized() {
        require(self.isInitialized, "contract not initialized");
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

    // Send Jetton
    inline fun sendJetton(_to: Address,_amount: Int, _destination: Address, _response_destination: Address) {
        // Send Jetton back to the sender        
        send(SendParameters{
            to: _to,
            value: 0,
            mode: SendRemainingValue,
            body: JettonTransfer{
                query_id: 0,
                amount: _amount,
                destination: _destination,
                response_destination: _response_destination,
                custom_payload: null,
                forward_ton_amount: 0,
                forward_payload: emptySlice()
            }.toCell()    
        });
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