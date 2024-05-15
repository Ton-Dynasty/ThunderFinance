import "@stdlib/deploy";
import "./trait_master_chef.tact";

// MasterChef Contract: Users deposit, withdraw and harvest their LP tokens in this contract
contract JettonMasterChef with Deployable, MasterChef {
    // State
    isInitialized: Bool = false;

    // Pool Info
    owner: Address;
    pools: map<Address, PoolInfo>;
    totalAllocPoint: Int as uint256 = 0;
    deadline: Int as uint64 = 0;
    startTime: Int as uint64 = 0;
    metaData: Cell;
    totalLpSupply: Int = 0; // Caculated total LP supply(In each pool)
    redundantReward: Int = 0; // The redundant reward for the owner
    lastWithdrawTime: Int = 0; // The last withdraw time

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
                body: "Setup Error: non-positive RPS".asComment()
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
            let feeForDevs: Int = self.totalReward * FEE_PERCENT_FOR_DEV / 1000; // 0.3% fee
            
            // Have to transfer reward jetton and fee to the contract
            let expectedAmount: Int = self.totalReward + feeForDevs;
            if(msg.amount < expectedAmount || now() > self.deadline) {
                self.sendJetton(self.mcRewardJettonWallet, 0 ,msg.amount, msg.sender, msg.sender, SendRemainingValue);
                return;
            }

            // Set the fee for devs
            self.feeForDevs = feeForDevs;
            self.isInitialized = true;

            // Send Jetton Fee to ThunderMint
            self.sendJetton(self.mcRewardJettonWallet, 0, self.feeForDevs, self.thunderMintWallet, self.thunderMintWallet, SendRemainingValue);

            return;
        }
        // check if pool exists or exceed the deadline
        if(self.pools.get(ctx.sender) == null || now() > self.deadline || now() < self.startTime || ctx.value < ton("0.065")){
            // Send the jetton back to the sender if pool does not exist
            self.sendJetton(ctx.sender, ctx.value - ton("0.03"), msg.amount, msg.sender, msg.sender, 0);
            return;
        }

        // Send the redundant jetton back to the owner
        if(self.totalLpSupply == 0) {
            self.redundantReward = self.redundantReward + (now() - self.lastWithdrawTime) * self.rewardPerSecond;
        }
        
        // Deposit the LP tokens for the user
        self.userDeposit(msg, ctx);

    }

    // MiniChef will send this message to ask MasterChef to send reward
    receive(msg: HarvestInternalReply) {
        self.requireMiniChef(msg.sender);
        let ctx: Context = context();
        self.sendJetton(self.mcRewardJettonWallet, ctx.value - ton("0.0097"), msg.reward, msg.beneficiary, msg.beneficiary, 0); // 0.009605376
    }

    // MiniChef send this message to ask MasterChef to withdraw LP tokens and harvest reward
    receive(msg: WithdrawAndHarvestReply) {
        self.requireMiniChef(msg.sender);

        let ctx: Context = context();
        // 0.015 / 2 = 0.0075
        if (msg.rewardAmount > 0) {
            // Send Reward to the beneficiary
            self.sendJetton(self.mcRewardJettonWallet, ctx.value / 2 - ton("0.008"), msg.rewardAmount, msg.beneficiary, msg.beneficiary, 0);
        }

        if(msg.withdrawAmount > 0) {    
            // Withdraw lpToken to msg.beneficiary
            let pool: PoolInfo = self.pools.get(msg.lpTokenAddress)!!;
            pool.lpSupply = pool.lpSupply - msg.withdrawAmount;
            self.totalLpSupply = self.totalLpSupply - msg.withdrawAmount;
            self.lastWithdrawTime = now();
            self.pools.set(ctx.sender, pool);
            self.sendJetton(pool.lpTokenAddress, ctx.value / 2 - ton("0.008"), msg.withdrawAmount, msg.beneficiary, msg.beneficiary, 0);

        }
    }

    receive("Redeem") {
        let ctx: Context = context();
        require(ctx.value > ton("0.05"), "Not enough TON to redeem");
        if(self.totalLpSupply == 0) {
            let time: Int = min(now(), self.deadline);
            self.redundantReward = self.redundantReward + (time - self.lastWithdrawTime) * self.rewardPerSecond;
            self.lastWithdrawTime = now();
        }
        if(self.redundantReward > 0) {
            self.sendJetton(self.mcRewardJettonWallet, ctx.value - ton("0.02"), self.redundantReward, self.owner, self.owner, 0);
            self.redundantReward = 0;
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

