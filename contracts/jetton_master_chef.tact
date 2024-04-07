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

    // for reward jetton
    mcRewardJettonWallet: Address;
    rewardPerSecond: Int as coins = 0;
    totalReward: Int = 0;


    // For ThunderMint
    thunderMintWallet: Address;
    thunderMintJettonWallet: Address;
    Fee: Int = 3; // 0.3%
    jettonForDevs: Int = 0;
    tonForDevs: Int = 0;

    // initialize the contract with owner and reward jetton wallet address
    init(owner: Address, _seed: Int) {
        self.owner = owner;
        self.isInitialized = false;
        self.mcRewardJettonWallet = newAddress(0, 0);
        self.thunderMintWallet = newAddress(0, 0);
        self.thunderMintJettonWallet = newAddress(0, 0);
        self.metaData = emptyCell();
        emit(DeployMasterChef{owner: owner, seed: _seed}.toCell());
    }

    // Kitchen contract will send this message to initialize the MasterChef
    receive(msg: SetUp) {
        require(!self.isInitialized, "contract already initialized");
        require(self.mcRewardJettonWallet == newAddress(0, 0), "reward wallet already set");
        self.mcRewardJettonWallet = msg.mcRewardJettonWallet;
        self.thunderMintWallet = msg.thunderMintWallet;
        self.thunderMintJettonWallet = msg.thunderMintJettonWallet;
        self.metaData = build_content_cell(msg.metaData);
        self.totalReward = msg.totalReward;
        self.deadline = msg.deadline;
    }

    
    // Owner has to send Reward Jetton to the MasterChef first, so that MasterChef can distribute the reward to the users
    // Users send JettonTransferNotification to the MasterChef to deposit their LP tokens
    receive(msg: JettonTransferNotification) {
        // context sender is from different kind of jetton wallet 
        let ctx: Context = context();
        // If not initialized, only accept reward jetton with Setup message payload
        if (!self.isInitialized) {
            if(ctx.sender != self.mcRewardJettonWallet || msg.sender != self.owner) {
                self.sendJetton(self.mcRewardJettonWallet, msg.amount, msg.sender, msg.sender);
                throw(ERROR_NOT_INITIALIZED);
            }
            self.handleSetup(ctx, msg.amount, msg.sender);
            return;
        }

        // check if pool exists
        if(self.pools.get(ctx.sender) == null) {
            self.sendJetton(ctx.sender, msg.amount, msg.sender, msg.sender);
            throw(ERROR_POOL_NOT_FOUND);
        }

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
        self.sendJetton(self.mcRewardJettonWallet, msg.reward, msg.beneficiary, msg.beneficiary);
    }

    // Pay the fee to the devs
    receive("Collect") {
        // Reward jetton for devs can only be sent to ThunderMint once
        if (self.jettonForDevs > 0) {
            send(SendParameters{
                    to: self.mcRewardJettonWallet,
                    value: self.tonForDevs,
                    mode: SendRemainingValue,
                    body: JettonTransfer{
                        query_id: 0,
                        amount: self.jettonForDevs,
                        destination: self.thunderMintWallet,
                        response_destination: self.thunderMintWallet,
                        custom_payload: null,
                        forward_ton_amount: 0,
                        forward_payload: emptySlice()
                }.toCell()
            });
            self.tonForDevs = 0;
            self.jettonForDevs = 0;
            return;
        }
        // Only send ton to devs
        send(SendParameters{
            to: self.thunderMintWallet, 
            value: self.tonForDevs,
            mode: 0, 
            body: "Fees For Devs".asComment()
        });
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
            self.sendJetton(self.mcRewardJettonWallet,amount, sender, sender);
            throw(ERROR_NOT_ENOUGH_AMOUNT_OR_RPS_ZERO);
        }
        self.isInitialized = true;
        // Send the remaining jetton back to the sender
        let remainingJetton: Int = amount - expectedAmount;
        if (remainingJetton > 0) {
            self.sendJetton(self.mcRewardJettonWallet, remainingJetton, sender, sender);
        }
    }

    // Get MasterChef Data
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