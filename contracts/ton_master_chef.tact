import "@stdlib/deploy";
import "./master_chef.tact";

// MasterChef Contract: Users deposit, withdraw and harvest their LP tokens in this contract
contract TonMasterChef with Deployable, MasterChef {
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

    // initialize the contract with owner and reward jetton wallet address
    init(owner: Address, _seed: Int) {
        self.owner = owner;
        self.isInitialized = false;
        self.thunderMintWallet = newAddress(0, 0);
        self.metaData = emptyCell();
        emit(DeployMasterChef{owner: owner, seed: _seed}.toCell());
    }

    // Kitchen contract will send this message to initialize the MasterChef
    receive(msg: SetUpForTon) {
        self.requireNotInitialized();
        self.createdAt = now();
        self.rewardPerSecond = self.totalReward / (self.deadline - self.createdAt);
        require(self.rewardPerSecond > 0, "reward per second must be greater than 0");
        // Check if the sended TON is enough to cover the total reward and fee
        let ctx: Context = context();
        let feeForDevs: Int = msg.totalReward * self.Fee / 1000;
        let expectedTon: Int = msg.totalReward + feeForDevs + STORAGE_FEES;
        require(ctx.value >= expectedTon, "insufficient TON amount for reward and fee");
        self.thunderMintWallet = msg.thunderMintWallet;
        self.metaData = build_content_cell(msg.metaData);
        self.totalReward = msg.totalReward;
        self.deadline = msg.deadline;
        self.tonForDevs += feeForDevs;
        self.isInitialized = true;
    }
    
    // Owner has to send Reward Jetton to the MasterChef first, so that MasterChef can distribute the reward to the users
    // Users send JettonTransferNotification to the MasterChef to deposit their LP tokens
    receive(msg: JettonTransferNotification) {
        // context sender is from different kind of jetton wallet 
        let ctx: Context = context();

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

    // MiniChef will send this message to ask MasterChef to send reward
    receive(msg: HarvestInternalReply) {
        let initCode: StateInit = self._calculateMiniChefInit(msg.sender);
        let expectedSender: Address = contractAddress(initCode);
        require(expectedSender == sender(), "unexpected sender");
        send(SendParameters{
            to: msg.beneficiary,
            value: msg.reward,
            mode: SendRemainingValue,
            body: "Reward of TON".asComment()
        });
    }

    // Pay the fee to the devs
    receive("CollectTON") {
        // Send ton to devs
        send(SendParameters{
            to: self.thunderMintWallet, 
            value: self.tonForDevs,
            mode: 0, 
            body: "Fees For Devs".asComment()
        });
        self.tonForDevs = 0;
    }

    // Get MasterChef Data
    get fun getTonMasterChefData(): TonMasterChefData {
        return TonMasterChefData{
            owner: self.owner,
            rewardPerSecond: self.rewardPerSecond,
            createdAt: self.createdAt,
            deadline: self.deadline,
            isInitialized: self.isInitialized,
            totalAllocPoint: self.totalAllocPoint,
            tonForDevs: self.tonForDevs,
            pools: self.pools,
            metaData: self.metaData,
            totalReward: self.totalReward
        };
    }

}