import "@stdlib/deploy";
import "./trait_master_chef.tact";

// MasterChef Contract: Users deposit, withdraw and harvest their LP tokens in this contract
contract JettonMasterChef with Deployable, MasterChef {
    // State
    isInitialized: Bool = false;

    // Pool Info
    owner: Address;
    pools: map<Address, PoolInfo>;
    totalAllocPoint: Int as uint16 = 0;
    createdAt: Int as uint64 = 0;
    deadline: Int as uint64 = 0;
    startTime: Int as uint64 = 0;
    metaData: Cell;

    // For Reward Jetton
    mcRewardJettonWallet: Address;
    rewardPerSecond: Int as coins = 0;
    totalReward: Int as coins = 0;

    // For ThunderMint
    thunderMintWallet: Address;
    feeForDevs: Int as coins = 0;

    // initialize the contract with owner and seed
    init(_owner: Address, _seed: Int) {
        self.owner = _owner;
        self.mcRewardJettonWallet = ZERO_ADDRESS;
        self.thunderMintWallet = ZERO_ADDRESS;
        self.metaData = emptyCell();
        emit(DeployMasterChef{owner: _owner, seed: _seed}.toCell());
    }

    // Kitchen contract will send this message to deploy the MasterChef
    receive(msg: SetUpJettonMC) {
        require(!self.isInitialized, "contract already initialized");
        require(self.mcRewardJettonWallet == ZERO_ADDRESS, "reward wallet already set");
        // Jetton MasterChef Set Up
        self.mcRewardJettonWallet = msg.mcRewardJettonWallet;
        // Calculate reward per second in basicSetUp() and also other basic setup
        self.basicSetUp(msg.thunderMintWallet, msg.metaData, msg.totalReward, msg.deadline, msg.startTime);
        if(self.rewardPerSecond <= 0) {
            send(SendParameters{
                to: self.owner,
                value: 0,
                mode: SendRemainingBalance + SendDestroyIfZero,
                body: "Send All TON Back".asComment()
            });
            return;
        }
    }
    
    // 1. Owner has to send Reward Jetton to the MasterChef first, so that MasterChef can distribute the reward to the users
    // 2. Users send JettonTransferNotification to the MasterChef to deposit their LP tokens
    receive(msg: JettonTransferNotification) {
        // context sender can come from different kind of jetton wallet depending on the pool
        let ctx: Context = context();

        // If not initialized, only accept reward jetton with Setup message payload
        if (!self.isInitialized) {
            if(ctx.sender != self.mcRewardJettonWallet || msg.sender != self.owner) {
                throw(ERROR_WRONG_AUTH);
            }
            // Calculate the reward jetton for ThunderMint team
            self.feeForDevs = self.totalReward * FEE_PERCENT_FOR_DEV / 1000; // 0.3% fee
            // Have to transfer reward jetton and fee to the contract
            let expectedAmount: Int = self.totalReward + self.feeForDevs;
            if(msg.amount < expectedAmount) {
                self.sendJetton(self.mcRewardJettonWallet, 0 ,msg.amount, msg.sender, msg.sender, SendRemainingValue);
                return;
            }
            self.isInitialized = true;
            // Send the remaining jetton back to the sender
            // TODO: @ipromise2324 Do we really need to send the remaining jetton back to the sender? I think the actual amount should be sent to the contract
            let remainingJetton: Int = msg.amount - expectedAmount;
            if (remainingJetton > 0) {
                self.sendJetton(self.mcRewardJettonWallet, 0, remainingJetton, msg.sender, msg.sender, SendRemainingValue);
            }
            return;
        }

        // check if pool exists or exceed the deadline
        if(self.pools.get(ctx.sender) == null || now() > self.deadline || now() < self.startTime){
            // Send the jetton back to the sender if pool does not exist
            self.sendJetton(ctx.sender, 0, msg.amount, msg.sender, msg.sender, SendRemainingValue);
            return;
        }
        // Deposit the LP tokens for the user
        self.userDeposit(msg, ctx);
    }

    // MiniChef will send this message to ask MasterChef to send reward
    receive(msg: HarvestInternalReply) {
        self.requireMiniChef(msg.sender);
        self.sendJetton(self.mcRewardJettonWallet, 0, msg.reward, msg.beneficiary, msg.beneficiary, SendRemainingValue);
    }

    // MiniChef send this message to ask MasterChef to withdraw LP tokens and harvest reward
    receive(msg: WithdrawAndHarvestReply) {
        let initCode: StateInit = self._calculateMiniChefInit(msg.sender);
        let expectedSender: Address = contractAddress(initCode);
        require(expectedSender == sender(), "unexpected sender");

        let ctx: Context = context();

        // Send Reward to the beneficiary
        self.sendJetton(self.mcRewardJettonWallet, ctx.value / 2, msg.rewardAmount, msg.beneficiary, msg.beneficiary, 0);

        // Withdraw lpToken to msg.beneficiary
        let pool: PoolInfo = self.pools.get(msg.lpTokenAddress)!!;
        self.sendJetton(pool.lpTokenAddress, ctx.value / 2, msg.withdrawAmount, msg.beneficiary, msg.beneficiary, 0);
    }

    // Pay the fee to ThunderMint team
    receive("Collect") {
        // Reward jetton for devs can only be sent to ThunderMint once
        if (self.feeForDevs > 0) {
            self.sendJetton(self.mcRewardJettonWallet, 0, self.feeForDevs, self.thunderMintWallet, self.thunderMintWallet, SendRemainingValue);
            self.feeForDevs = 0;
            return;
        }
    }

    // Get Methods //

    // Get JettonMasterChef Data
    get fun getJettonMasterChefData(): MasterChefData {
        return MasterChefData{
            owner: self.owner,
            mcRewardJettonWallet: self.mcRewardJettonWallet,
            rewardPerSecond: self.rewardPerSecond,
            startTime: self.startTime,
            deadline: self.deadline,
            isInitialized: self.isInitialized,
            totalAllocPoint: self.totalAllocPoint,
            feeForDevs: self.feeForDevs,
            pools: self.pools,
            metaData: self.metaData,
            totalReward: self.totalReward
        };
    }
}

