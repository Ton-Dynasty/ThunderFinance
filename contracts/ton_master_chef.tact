import "@stdlib/deploy";
import "./trait_master_chef.tact";

// MasterChef Contract: Users deposit, withdraw and harvest their LP tokens in this contract
contract TonMasterChef with Deployable, MasterChef {
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
    rewardPerSecond: Int as coins = 0;
    totalReward: Int = 0;

    // For ThunderMint
    thunderMintWallet: Address;
    Fee: Int = 3; // 0.3%
    tonForDevs: Int = 0;
    ZERO_ADDRESS: Address;

    // initialize the contract with owner and seed
    init(owner: Address, _seed: Int) {
        self.owner = owner;
        self.isInitialized = false;
        self.ZERO_ADDRESS = newAddress(0, 0);
        self.thunderMintWallet = self.ZERO_ADDRESS;
        self.metaData = emptyCell();
        emit(DeployMasterChef{owner: owner, seed: _seed}.toCell());
    }

    // Kitchen contract will send this message to initialize the MasterChef and also send the total reward ton
    receive(msg: SetUpForTonMC) {
        if (self.isInitialized) {
            // If the contract is already initialized, then return the remaining TON to the owner
            self.sendTon(msg.owner, 0, SendRemainingValue);
            throw(ERROR_NOT_INITIALIZED);
        }
        // Initialize the contract
        // Check if the sended TON is enough to cover the total reward and fee
        let ctx: Context = context();
        // Calculate reward per second in basicSetUp() and also other basic setup
        self.basicSetUp(msg.thunderMintWallet, msg.metaData, msg.totalReward, msg.deadline);
        let sendedTon: Int = ctx.value;
        let feeForDevs: Int = msg.totalReward * self.Fee / 1000;
        let expectedTon: Int = msg.totalReward + feeForDevs + STORAGE_FEES;
        if (sendedTon < expectedTon) {
            self.sendTon(msg.owner, 0, SendRemainingValue);
            throw(ERROR_NOT_ENOUGH_REWARD);
        }
        self.tonForDevs += feeForDevs;
        self.isInitialized = true;

        // Sending the remaining TON to the owner
        if(sendedTon > expectedTon) {
            self.sendTon(self.owner, sendedTon - expectedTon, 0);
        }
    }
    
    // Users send JettonTransferNotification to the MasterChef to deposit their LP tokens
    receive(msg: JettonTransferNotification) {
        // context sender is from different kind of jetton wallet 
        let ctx: Context = context();

        // check if pool exists
        if(self.pools.get(ctx.sender) == null) {
            // If the pool does not exist, then return the jetton to the sender
            self.sendJetton(ctx.sender, 0 ,msg.amount, msg.sender, msg.sender);
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
        self.sendTon(msg.beneficiary, msg.reward, SendRemainingValue);
    }

    // Pay the fee to Thunder Mint
    receive("CollectTON") {
        // Send ton to devs
        self.sendTon(self.thunderMintWallet, self.tonForDevs, 0);
        self.tonForDevs = 0;
    }

    // Get Methods //

    // Get TonMasterChef Data
    get fun getTonMasterChefData(): MasterChefData {
        return MasterChefData{
            owner: self.owner,
            mcRewardJettonWallet: self.ZERO_ADDRESS, // not used in TonMasterChef
            rewardPerSecond: self.rewardPerSecond,
            createdAt: self.createdAt,
            deadline: self.deadline,
            isInitialized: self.isInitialized,
            totalAllocPoint: self.totalAllocPoint,
            tonForDevs: self.tonForDevs,
            jettonForDevs: 0, // not used in TonMasterChef
            pools: self.pools,
            metaData: self.metaData,
            totalReward: self.totalReward
        };
    }

}