import "@stdlib/deploy";
import "./trait_master_chef.tact";

// MasterChef Contract: Users deposit, withdraw and harvest their LP tokens in this contract
contract JettonMasterChef with Deployable, MasterChef {
    // State
    isInitialized: Bool = false;

    // Pool Info
    owner: Address;
    pools: map<Address, PoolInfo>;
    totalAllocPoint: Int = 0;
    createdAt: Int as uint64 = 0;
    deadline: Int as uint64 = 0;
    metaData: Cell;

    // For Reward Jetton
    mcRewardJettonWallet: Address;
    rewardPerSecond: Int as coins = 0;
    totalReward: Int = 0;


    // For ThunderMint
    thunderMintWallet: Address;
    thunderMintJettonWallet: Address;
    Fee: Int = 3; // 0.3%
    jettonForDevs: Int = 0;
    tonForDevs: Int = 0;

    // initialize the contract with owner and seed
    init(owner: Address, _seed: Int) {
        self.owner = owner;
        self.isInitialized = false;
        self.mcRewardJettonWallet = newAddress(0, 0);
        self.thunderMintWallet = newAddress(0, 0);
        self.thunderMintJettonWallet = newAddress(0, 0);
        self.metaData = emptyCell();
        emit(DeployMasterChef{owner: owner, seed: _seed}.toCell());
    }

    // Kitchen contract will send this message to deploy the MasterChef
    receive(msg: SetUp) {
        require(!self.isInitialized, "contract already initialized");
        require(self.mcRewardJettonWallet == newAddress(0, 0), "reward wallet already set");
        self.mcRewardJettonWallet = msg.mcRewardJettonWallet;
        self.thunderMintJettonWallet = msg.thunderMintJettonWallet;
        // Basic setup
        self.basicSetUp(msg.thunderMintWallet, msg.metaData, msg.totalReward, msg.deadline);
    }
    
    // 1. Owner has to send Reward Jetton to the MasterChef first, so that MasterChef can distribute the reward to the users
    // 2. Users send JettonTransferNotification to the MasterChef to deposit their LP tokens
    receive(msg: JettonTransferNotification) {
        // context sender can come from different kind of jetton wallet depending on the pool
        let ctx: Context = context();
        // If not initialized, only accept reward jetton with Setup message payload
        if (!self.isInitialized) {
            if(ctx.sender != self.mcRewardJettonWallet || msg.sender != self.owner) {
                // Send the jetton back to the sender if conditions are not met
                self.sendJetton(self.mcRewardJettonWallet, 0, msg.amount, msg.sender, msg.sender);
                throw(ERROR_NOT_INITIALIZED);
            }
            // Handle the setup message to initialize the contract
            self.handleSetup(ctx, msg.amount, msg.sender);
            return;
        }

        // check if pool exists
        if(self.pools.get(ctx.sender) == null) {
            // Send the jetton back to the sender if pool does not exist
            self.sendJetton(ctx.sender, 0, msg.amount, msg.sender, msg.sender);
            throw(ERROR_POOL_NOT_FOUND);
        }
        // Deposit the LP tokens for the user
        self.userDeposit(msg,ctx);
    }

    // MiniChef will send this message to ask MasterChef to send reward
    receive(msg: HarvestInternalReply) {
        let initCode: StateInit = self._calculateMiniChefInit(msg.sender);
        let expectedSender: Address = contractAddress(initCode);
        require(expectedSender == sender(), "unexpected sender");
        self.sendJetton(self.mcRewardJettonWallet, 0, msg.reward, msg.beneficiary, msg.beneficiary);
    }

    // Pay the fee to ThunderMint team
    receive("Collect") {
        // Reward jetton for devs can only be sent to ThunderMint once
        if (self.jettonForDevs > 0) {
            self.sendJetton(self.mcRewardJettonWallet, self.tonForDevs, self.jettonForDevs, self.thunderMintWallet, self.thunderMintWallet);
            self.tonForDevs = 0;
            self.jettonForDevs = 0;
            return;
        }
        // Only send ton to devs
        self.sendTon(self.thunderMintWallet, self.tonForDevs, 0);
        self.tonForDevs = 0;
    }

    // Internal Functions //

    // Handle the setup message which is used to initialize the contract
    inline fun handleSetup(ctx: Context, amount: Int, sender: Address) {
        self.createdAt = now();
        self.rewardPerSecond = self.totalReward / (self.deadline - self.createdAt);
        self.jettonForDevs = self.totalReward * self.Fee / 1000; // 0.3% fee
        // Have to transfer reward jetton and fee to the contract
        let expectedAmount: Int = self.totalReward + self.jettonForDevs;
        if(amount < expectedAmount || self.rewardPerSecond <= 0) {
            self.sendJetton(self.mcRewardJettonWallet,0 ,amount, sender, sender);
            throw(ERROR_NOT_ENOUGH_AMOUNT_OR_RPS_ZERO);
        }
        self.isInitialized = true;
        // Send the remaining jetton back to the sender
        let remainingJetton: Int = amount - expectedAmount;
        if (remainingJetton > 0) {
            self.sendJetton(self.mcRewardJettonWallet, 0, remainingJetton, sender, sender);
        }
    }

    // Get JettonMasterChef Data
    get fun getJettonMasterChefData(): JettonMasterChefData {
        return JettonMasterChefData{
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
}