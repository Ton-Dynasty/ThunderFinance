import "@stdlib/deploy";
import "./trait_master_chef.tact";

// MasterChef Contract: Users deposit, withdraw and harvest their LP tokens in this contract
contract TonMasterChef with Deployable, MasterChef {
    // Initializer
    isInitialized: Bool = false;

    // Pool Info
    owner: Address;
    pools: map<Address, PoolInfo>;
    totalAllocPoint: Int as uint256 = 0;
    deadline: Int as uint64 = 0;
    startTime: Int as uint64 = 0;
    metaData: Cell;
    totalLpSupply: Int = 0; // Caculated total LP supply(In each pool)
    reduntantReward: Int = 0; // The redundant reward for the owner
    lastWithdrawTime: Int = 0; // The last withdraw time

    // For Reward TON
    rewardPerSecond: Int as coins = 0;
    totalReward: Int as coins = 0;

    // For ThunderMint
    thunderMintWallet: Address;       // The wallet address for thunder mint to collect fee
    feeForDevs: Int as coins = 0;     // The fee for devs

    // initialize the contract with owner and seed
    init(_owner: Address, _seed: Int) {
        self.owner = _owner;
        self.isInitialized = false;
        self.thunderMintWallet = ZERO_ADDRESS;
        self.metaData = emptyCell();
        emit(DeployMasterChef{owner: _owner, seed: _seed}.toCell());
    }

    // Kitchen contract will send this message to initialize the MasterChef and also send the total reward ton
    receive(msg: SetUpTonMC) {
        if (self.isInitialized) {
            // If the contract is already initialized, then return the remaining TON to the owner
            self.sendTon(msg.owner, 0, SendRemainingValue);
            throw(ERROR_NOT_INITIALIZED);
        }
        // Initialize the contract
        // Check if the sended TON is enough to cover the total reward and fee
        let ctx: Context = context();
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
        let remainTon: Int = ctx.value - MIN_GAS_FEE;
        let feeForDevs: Int = msg.totalReward * FEE_PERCENT_FOR_DEV / 1000;
        let expectedTon: Int = msg.totalReward + feeForDevs;
        if (remainTon < expectedTon || now() > self.deadline) {
            send(SendParameters{
                to: msg.owner,
                value: remainTon,
                mode: SendRemainingBalance + SendDestroyIfZero,
                body: "Setup Error: not enough reward TON".asComment()
            });
            return;
        }
        // Update storage when ton is sufficient
        self.isInitialized = true;
        self.feeForDevs = feeForDevs;
        if (self.feeForDevs > MIN_GAS_FEE) {
            self.sendTon(self.thunderMintWallet, self.feeForDevs - MIN_GAS_FEE, 0);
        }
        
        // Sending the remaining TON to the owner
        if(remainTon > expectedTon) {
            self.sendTon(self.owner, remainTon - expectedTon, 0);
        }
    }
    
    // Users send JettonTransferNotification to the MasterChef to deposit their LP tokens
    receive(msg: JettonTransferNotification) {
        // context sender is from different kind of jetton wallet 
        let ctx: Context = context();

        // check if pool exists or exceed the deadline
        if(self.pools.get(ctx.sender) == null || now() > self.deadline || now() < self.startTime || ctx.value < ton("0.04")) {
            // Send the jetton back to the sender if pool does not exist
            self.sendJetton(ctx.sender, 0, msg.amount, msg.sender, msg.sender, SendRemainingValue);
            return;
        }
        
        // Send the redundant ton back to the owner
        if(self.totalLpSupply == 0) {
            self.reduntantReward = self.reduntantReward + (now() - self.lastWithdrawTime) * self.rewardPerSecond;
        }

        // Deposit the LP tokens for the user
        self.userDeposit(msg, ctx);
    }

    // MiniChef will send this message to ask MasterChef to send reward
    receive(msg: HarvestInternalReply) {
        self.requireMiniChef(msg.sender);
        self.sendTon(msg.beneficiary, msg.reward, SendRemainingValue);
    }

    // MiniChef send this message to ask MasterChef to withdraw LP tokens and harvest reward
    receive(msg: WithdrawAndHarvestReply) {
        self.requireMiniChef(msg.sender);

        let ctx: Context = context();
        let sendTon: Int = ctx.value;

        if (msg.rewardAmount > 0) {
            // Send Reward to the user
            self.sendTon(msg.beneficiary, msg.rewardAmount, SendIgnoreErrors);
        }

        if(msg.withdrawAmount > 0) {
            // Withdraw to msg.beneficiary
            let pool: PoolInfo = self.pools.get(msg.lpTokenAddress)!!;
            pool.lpSupply = pool.lpSupply - msg.withdrawAmount;
            self.totalLpSupply = self.totalLpSupply - msg.withdrawAmount;
            self.lastWithdrawTime = now();
            self.pools.set(ctx.sender, pool);
            self.sendJetton(pool.lpTokenAddress, sendTon - THUNDER_FEE, msg.withdrawAmount, msg.beneficiary, msg.beneficiary, SendIgnoreErrors);
        }
    }

    receive("Redeem") {
        if(self.totalLpSupply == 0) {
            let time: Int = min(now(), self.deadline);
            self.reduntantReward = self.reduntantReward + (time - self.lastWithdrawTime) * self.rewardPerSecond;
            self.lastWithdrawTime = now();
        }
        if(self.reduntantReward > 0) {
            self.sendTon(self.owner, self.reduntantReward, SendRemainingValue);
            self.reduntantReward = 0;
        }
    }

    // Get Methods //

    // Get TonMasterChef Data
    get fun getTonMasterChefData(): MasterChefData {
        return MasterChefData{
            owner: self.owner,
            mcRewardJettonWallet: ZERO_ADDRESS, // not used in TonMasterChef
            rewardPerSecond: self.rewardPerSecond,
            startTime: self.startTime,
            deadline: self.deadline,
            isInitialized: self.isInitialized,
            feeForDevs: self.feeForDevs,
            totalAllocPoint: self.totalAllocPoint,
            pools: self.pools,
            metaData: self.metaData,
            totalReward: self.totalReward
        };
    }


}