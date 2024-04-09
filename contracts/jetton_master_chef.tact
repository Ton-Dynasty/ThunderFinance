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
    Fee: Int = 3; // 0.3%
    jettonForDevs: Int = 0;
    tonForDevs: Int = 0;

    // initialize the contract with owner and seed
    init(_owner: Address, _seed: Int) {
        self.owner = _owner;
        self.mcRewardJettonWallet = address("0QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACkT");
        self.thunderMintWallet = address("0QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACkT");
        self.metaData = emptyCell();
        emit(DeployMasterChef{owner: _owner, seed: _seed}.toCell());
    }

    // Kitchen contract will send this message to deploy the MasterChef
    receive(msg: SetUpJettonMC) {
        require(!self.isInitialized, "contract already initialized");
        require(self.mcRewardJettonWallet == address("0QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACkT"), "reward wallet already set");
        // Jetton MasterChef Set Up
        self.mcRewardJettonWallet = msg.mcRewardJettonWallet;
        // Calculate reward per second in basicSetUp() and also other basic setup
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
                throw(ERROR_WRONG_AUTH);
            }
            // Calculate the reward jetton for ThunderMint team
            self.jettonForDevs = self.totalReward * self.Fee / 1000; // 0.3% fee
            // Have to transfer reward jetton and fee to the contract
            let expectedAmount: Int = self.totalReward + self.jettonForDevs;
            if(msg.amount < expectedAmount) {
                self.sendJetton(self.mcRewardJettonWallet,0 ,msg.amount, msg.sender, msg.sender, SendRemainingValue);
                throw(ERROR_NOT_ENOUGH_REWARD);
                return;
            }
            self.isInitialized = true;
            // Send the remaining jetton back to the sender
            let remainingJetton: Int = msg.amount - expectedAmount;
            if (remainingJetton > 0) {
                self.sendJetton(self.mcRewardJettonWallet, 0, remainingJetton, msg.sender, msg.sender, SendRemainingValue);
            }
            return;
        }

        // check if pool exists
        if(self.pools.get(ctx.sender) == null) {
            // Send the jetton back to the sender if pool does not exist
            self.sendJetton(ctx.sender, 0, msg.amount, msg.sender, msg.sender, SendRemainingValue);
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
        self.sendJetton(self.mcRewardJettonWallet, 0, msg.reward, msg.beneficiary, msg.beneficiary, SendRemainingValue);
    }

    // MiniChef send this message to ask MasterChef to withdraw LP tokens and harvest reward
    receive(msg: WithdrawAndHarvestReply) {
        let initCode: StateInit = self._calculateMiniChefInit(msg.sender);
        let expectedSender: Address = contractAddress(initCode);
        require(expectedSender == sender(), "unexpected sender");
        let ctx: Context = context();
        let sendBackTon: Int = ctx.value;

        // Send Reward to the user
        self.sendJetton(self.mcRewardJettonWallet, sendBackTon / 2, msg.reward, msg.beneficiary, msg.beneficiary, SendIgnoreErrors);

        // Withdraw to msg.beneficiary
        let pool: PoolInfo = self.pools.get(msg.lpTokenAddress)!!;
        self.sendJetton(pool.lpTokenAddress, sendBackTon / 2, msg.amount, msg.beneficiary, msg.beneficiary, SendIgnoreErrors);
    }

    // Pay the fee to ThunderMint team
    receive("Collect") {
        // Reward jetton for devs can only be sent to ThunderMint once
        if (self.jettonForDevs > 0) {
            self.sendJetton(self.mcRewardJettonWallet, self.tonForDevs, self.jettonForDevs, self.thunderMintWallet, self.thunderMintWallet, SendRemainingValue);
            self.tonForDevs = 0;
            self.jettonForDevs = 0;
            return;
        }
        // Only send ton to devs
        self.sendTon(self.thunderMintWallet, self.tonForDevs, 0);
        self.tonForDevs = 0;
    }

    // Get Methods //

    // Get JettonMasterChef Data
    get fun getJettonMasterChefData(): MasterChefData {
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
}

