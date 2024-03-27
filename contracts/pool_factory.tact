import "@stdlib/deploy";
struct Init{
    owner: Address;
    rewardPerBlock: Int as coins;
}

message AddPool{
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    allocPoint: Int;
}

message UpdatePool {
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
}


// Create User Pool 
message UserDeposit {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    amount: Int as coins;
    rewardDebt: Int as coins;
}

struct PoolInfo {
    allocPoint: Int;
    lastRewardBlock: Int as uint256;
    accRewardPerShare: Int as coins;
    lpSupply: Int as coins;
}

message(0x7362d09c) JettonTransferNotification {
    queryId: Int as uint64;                // arbitrary request number
    amount: Int as coins;                   // amount of jettons to transfer
    sender: Address;                        // address of the sender of the jettons
    forward_payload: Slice as remaining;    // optional custom payload
}


struct UserInfo {
    amount: Int as coins;
    rewardDebt: Int as coins;
}


message Withdraw {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    amount: Int as coins;
    beneficiary: Address;
}



message WithdrawInternal {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    amount: Int as coins;
    rewardDebt: Int as coins;
    beneficiary: Address;
    sender: Address;
}

message WithdrawInternalReply {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    amount: Int as coins;
    sender: Address;
    rewardDebt: Int as coins;
    beneficiary: Address;
}

message Harvest {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    benificiary: Address; // the one who will receive the reward
}

message HarvestInternal {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    benificiary: Address; // the one who will receive the reward
    accRewardPerShare: Int as coins;
}

message HarvestInternalReply {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    benificiary: Address; // the one who will receive the reward
    reward: Int as coins;
    sender: Address;
}

message WithdrawAndHarvest {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    amount: Int as coins;
    beneficiary: Address;
}

message WithdrawAndHarvestInternal {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    amount: Int as coins;
    accRewardPerShare: Int as coins;
    beneficiary: Address;
    sender: Address;
}

message WithdrawAndHarvestReply {
    queryId: Int as uint64;
    lpTokenAddress: Address; // Pool Factory LP token Wallet address
    benificiary: Address; // the one who will receive the reward
    reward: Int as coins;
    amount: Int as coins;
    sender: Address;
}

contract MasterChef with Deployable {

    // Pool
    owner: Address;
    pools: map<Address, PoolInfo>;
    totalAllocPoint: Int;
    lastRewardBlock: Int as uint256;
    lpSupply: Int as coins;
    rewardPerBlock: Int as coins;
    rewardDecimal: Int;
    accPerShare: Int as coins;

    init(owner: Address, rewardPerBlock: Int) {
        self.owner = owner;
        self.totalAllocPoint = 0;
        self.lastRewardBlock = now();
        self.rewardPerBlock = rewardPerBlock;
        self.lpSupply = 0;
        self.rewardDecimal = 6;
        self.accPerShare = 0;
    }


    receive(msg: AddPool){
        require(sender() == self.owner, "only owner can add pool");
        require(self.pools.get(msg.lpTokenAddress) == null , "pool already exist");
        self.totalAllocPoint = self.totalAllocPoint + msg.allocPoint;
        let poolInfo: PoolInfo = PoolInfo{
            allocPoint: msg.allocPoint,
            lastRewardBlock: now(),
            accRewardPerShare: 0,
            lpSupply: 0
        };
        self.pools.set(msg.lpTokenAddress,poolInfo);
    }

    receive (msg: UpdatePool) {
        self.updatePool(msg.lpTokenAddress);
    }
    
    receive(msg: JettonTransferNotification) {
        // get jetton wallet address
        let jettonWallet: Address = sender();

        // check if pool exists
        require(self.pools.get(jettonWallet) != null , "pool not exists");

        // transfer from masterchef jetton wallet
        self.updatePool(jettonWallet);

        // load address from forward payload, if it does not exist, use msg.sender
        let beneficiary: Address = msg.sender;
        let payload: Slice = msg.forward_payload;
        if (!payload.dataEmpty()) {
            beneficiary = msg.sender;
        }

        let initCode: StateInit = self._calculateMiniChefInit(beneficiary);
        let pool: PoolInfo = self.pools.get(jettonWallet)!!;
        send(SendParameters{
                to: contractAddress(initCode),
                value: 0,
                mode: SendRemainingValue,
                body: UserDeposit{
                    queryId: msg.queryId,
                    lpTokenAddress: jettonWallet,
                    amount: msg.amount,
                    rewardDebt: pool.accRewardPerShare * msg.amount
                }.toCell(),
                code: initCode.code,
                data: initCode.data
            }
        );
    }


    receive(msg: Withdraw) {
        // check if pool exists
        require(self.pools.get(msg.lpTokenAddress) != null , "pool not exists");

        let initCode: StateInit = self._calculateMiniChefInit(sender());
        let pool: PoolInfo = self.pools.get(msg.lpTokenAddress)!!;
        send(SendParameters{
                to: contractAddress(initCode),
                value: 0,
                mode: SendRemainingValue,
                bounce: true,
                body: WithdrawInternal{
                    queryId: msg.queryId,
                    lpTokenAddress: msg.lpTokenAddress,
                    amount: msg.amount,
                    rewardDebt: pool.accRewardPerShare * msg.amount,
                    beneficiary: msg.beneficiary,
                    sender: sender()
                }.toCell(),
                code: initCode.code,
                data: initCode.data
            }
        );
    }

    receive(msg: WithdrawInternalReply) {
        let initCode: StateInit = self._calculateMiniChefInit(msg.sender);
        let expectedSender: Address = contractAddress(initCode);
        require(expectedSender == sender(), "unexpected sender");

        // TODO: mint reward jetton to msg.beneficiary

        // TODO: send principle to msg.beneficiary
    }

    receive(msg: Harvest) {
        require(self.pools.get(msg.lpTokenAddress) != null , "pool not exists");
        let initCode: StateInit = self._calculateMiniChefInit(sender());
        let pool: PoolInfo = self.pools.get(msg.lpTokenAddress)!!;
        self.updatePool(msg.lpTokenAddress);
        send(SendParameters{
                to: contractAddress(initCode),
                value: 0,
                mode: SendRemainingValue,
                bounce: true,
                body: HarvestInternal{
                    queryId: msg.queryId,
                    lpTokenAddress: msg.lpTokenAddress,
                    accRewardPerShare: pool.accRewardPerShare,
                    benificiary: msg.benificiary
                }.toCell(),
                code: initCode.code,
                data: initCode.data
            }
        );

    }

    receive(msg: HarvestInternalReply) {
        let initCode: StateInit = self._calculateMiniChefInit(msg.sender);
        let expectedSender: Address = contractAddress(initCode);
        require(expectedSender == sender(), "unexpected sender");

        // TODO: mint reward jetton to msg.beneficiary
    }

    receive(msg: WithdrawAndHarvest) {
        // check if pool exists
        require(self.pools.get(msg.lpTokenAddress) != null , "pool not exists");

        let initCode: StateInit = self._calculateMiniChefInit(sender());
        let pool: PoolInfo = self.pools.get(msg.lpTokenAddress)!!;
        send(SendParameters{
                to: contractAddress(initCode),
                value: 0,
                mode: SendRemainingValue,
                bounce: true,
                body: WithdrawAndHarvestInternal{
                    queryId: msg.queryId,
                    lpTokenAddress: msg.lpTokenAddress,
                    amount: msg.amount,
                    accRewardPerShare: pool.accRewardPerShare,
                    beneficiary: msg.beneficiary,
                    sender: sender()
                }.toCell(),
                code: initCode.code,
                data: initCode.data
            }
        );
    }

    receive(msg: WithdrawAndHarvestReply) {
        let initCode: StateInit = self._calculateMiniChefInit(msg.sender);
        let expectedSender: Address = contractAddress(initCode);
        require(expectedSender == sender(), "unexpected sender");

        // TODO: mint reward jetton to msg.beneficiary

        // TODO: send amount to msg.beneficiary

    }


    fun updatePool(lpTokenAddress: Address) {
        require(self.pools.get(lpTokenAddress) != null , "pool not exists");
        let pool: PoolInfo = self.pools.get(lpTokenAddress)!!;
        let now: Int = now();
        if (now <= pool.lastRewardBlock)
        {
            return;
        }

        if (self.lpSupply > 0 ) {
            let reward: Int = (now - pool.lastRewardBlock) * self.rewardPerBlock;
            let rewardAmount: Int = reward * pool.allocPoint / self.totalAllocPoint;
            pool.accRewardPerShare = pool.accRewardPerShare + (rewardAmount / pool.lpSupply);
        } 
        pool.lastRewardBlock = now;
        self.pools.set(lpTokenAddress, pool);
    }

    inline fun _calculateMiniChefInit(userAddress: Address): StateInit {
        return initOf MiniChef(userAddress);
    }

    // Get Methods

    // Get alarm address by alarm index
    get fun getMiniChefAddress(userAddress: Address): Address {
        let initCode: StateInit = self._calculateMiniChefInit(userAddress);
        return contractAddress(initCode);
    }

}

contract MiniChef with Deployable {

    rewardDebt: Int as coins;
    owner: Address;
    userInfo: map <Address, UserInfo>;
    masterChef: Address;
    
    init(owner: Address) {
        self.rewardDebt = 0;
        self.owner = owner; 
        self.masterChef = sender();  
        self.userInfo = emptyMap();
    }

    receive(msg: UserDeposit) {
        require(sender() == self.masterChef, "only masterChef can deposit");
        let userInfo: UserInfo = self.userInfo.get(msg.lpTokenAddress)!!;
        userInfo.amount  = userInfo.amount + msg.amount;
        userInfo.rewardDebt = userInfo.rewardDebt + msg.rewardDebt; // TODO: ACC_PRECISION?
        self.userInfo.set(msg.lpTokenAddress, userInfo);
    }
    

    receive(msg: WithdrawInternal) {
        require(sender() == self.masterChef, "only masterChef can withdraw");
        let userInfo: UserInfo = self.userInfo.get(msg.lpTokenAddress)!!;
        require(userInfo.amount >= msg.amount, "insufficient balance");

        userInfo.amount = userInfo.amount - msg.amount;
        userInfo.rewardDebt = userInfo.rewardDebt - msg.rewardDebt; // TODO: ACC_PRECISION?

        self.userInfo.set(msg.lpTokenAddress, userInfo);

        send(SendParameters{
            to: self.masterChef,
            value: 0,
            mode: SendRemainingValue,
            body: WithdrawInternalReply{
                queryId: msg.queryId,
                lpTokenAddress: msg.lpTokenAddress,
                amount: msg.amount,
                sender: msg.sender,
                rewardDebt: userInfo.rewardDebt,
                beneficiary: msg.beneficiary
            }.toCell()
        });
    }

    receive(msg: HarvestInternal) {
        require(sender() == self.masterChef, "only masterChef can harvest");
        let userInfo: UserInfo = self.userInfo.get(msg.lpTokenAddress)!!;
        let accumulatedReward: Int = userInfo.amount * msg.accRewardPerShare; // TODO: ACC_PRECISION?
        let _pendingReward: Int = accumulatedReward - userInfo.rewardDebt;
        if (_pendingReward <= 0) {
            return;
        }
        userInfo.rewardDebt = accumulatedReward;
        self.userInfo.set(msg.lpTokenAddress, userInfo);

        // Send pending reward ammount to MasterChef, and then MasterChef will send it to the user
        send(SendParameters{
            to: self.masterChef,
            value: 0,
            mode: SendRemainingValue,
            body: HarvestInternalReply{
                queryId: msg.queryId,
                lpTokenAddress: msg.lpTokenAddress,
                reward: _pendingReward,
                sender: self.owner,
                benificiary: msg.benificiary
            }.toCell()
        });
    
    }
    receive(msg: WithdrawAndHarvestInternal) {
        require(sender() == self.masterChef, "only masterChef can harvest");
        let userInfo: UserInfo = self.userInfo.get(msg.lpTokenAddress)!!;
        let accumulatedReward: Int = userInfo.amount * msg.accRewardPerShare; // TODO: ACC_PRECISION?
        let _pendingReward: Int = accumulatedReward - userInfo.rewardDebt;
        if (_pendingReward <= 0) {
            return;
        }
        userInfo.rewardDebt = accumulatedReward - msg.amount * msg.accRewardPerShare;
        userInfo.amount = userInfo.amount - msg.amount;
        self.userInfo.set(msg.lpTokenAddress, userInfo);

        // Send WithdrawAndHarvestReply to MasterChef
        send(SendParameters{
            to: self.masterChef,
            value: 0,
            mode: SendRemainingValue,
            body: WithdrawAndHarvestReply{
                queryId: msg.queryId,
                lpTokenAddress: msg.lpTokenAddress,
                reward: _pendingReward,
                amount: msg.amount,
                sender: self.owner,
                benificiary: msg.beneficiary
            }.toCell()
        });

    }
}
