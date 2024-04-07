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
        if (self.isInitialized) {
            self.sendTon(msg.owner, 0, SendRemainingValue);
            throw(ERROR_NOT_INITIALIZED);
        }
        self.createdAt = now();
        self.rewardPerSecond = msg.totalReward / (msg.deadline - self.createdAt);
        // Check if the sended TON is enough to cover the total reward and fee
        let ctx: Context = context();
        let sendedTon: Int = ctx.value;
        let feeForDevs: Int = msg.totalReward * self.Fee / 1000;
        let expectedTon: Int = msg.totalReward + feeForDevs + STORAGE_FEES;
        if (self.rewardPerSecond <= 0 || sendedTon < expectedTon) {
            self.sendTon(msg.owner, 0, SendRemainingValue);
            throw(ERROR_NOT_ENOUGH_AMOUNT_OR_RPS_ZERO);
        }
        self.basicSetUp(msg.thunderMintWallet, msg.metaData, msg.totalReward, msg.deadline);
        self.tonForDevs += feeForDevs;
        self.isInitialized = true;

        // Sending the remaining TON to the owner
        if(sendedTon > expectedTon) {
            self.sendTon(self.owner, sendedTon - expectedTon, 0);
        }
    }
    
    // Owner has to send Reward Jetton to the MasterChef first, so that MasterChef can distribute the reward to the users
    // Users send JettonTransferNotification to the MasterChef to deposit their LP tokens
    receive(msg: JettonTransferNotification) {
        // context sender is from different kind of jetton wallet 
        let ctx: Context = context();

        // check if pool exists
        if(self.pools.get(ctx.sender) == null) {
            self.sendTon(msg.sender, 0, SendRemainingValue);
            throw(ERROR_POOL_NOT_FOUND);
        }
        self.userDeposit(msg,ctx);
    }

    // MiniChef will send this message to ask MasterChef to send reward
    receive(msg: HarvestInternalReply) {
        let initCode: StateInit = self._calculateMiniChefInit(msg.sender);
        let expectedSender: Address = contractAddress(initCode);
        require(expectedSender == sender(), "unexpected sender");
        self.sendTon(msg.beneficiary, msg.reward, SendRemainingValue);
    }

    // Pay the fee to the devs
    receive("CollectTON") {
        // Send ton to devs
        self.sendTon(self.thunderMintWallet, self.tonForDevs, 0);
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