import "@stdlib/deploy";
import "./messages";

// MiniChef Contract is used to record the user's deposit, such as the actual amount of LP token in each pool
// and the reward debt of each user in each pool.
// We use a map to store the user's information. Gas will be high when the map is large, yet the number of pools is limited, so it is acceptable.
contract MiniChef with Deployable {
    rewardDebt: Int;
    owner: Address;
    userInfo: map <Address, UserInfo>;
    masterChef: Address;
    
    init(owner: Address, masterChef: Address) {
        self.owner = owner; 
        self.masterChef = masterChef;  
        self.rewardDebt = 0;
    }

    // MasterChef will send this message to MiniChef to record the deposit at user info
    receive(msg: UserDeposit) {
        require(sender() == self.masterChef, "only masterChef can deposit");
        if(self.userInfo.get(msg.lpTokenAddress) == null) {
            self.userInfo.set(msg.lpTokenAddress, UserInfo{amount: 0, rewardDebt: 0});
        }
        let userInfo: UserInfo = self.userInfo.get(msg.lpTokenAddress)!!;
        userInfo.amount = userInfo.amount + msg.amount;
        userInfo.rewardDebt = userInfo.rewardDebt + msg.rewardDebt; 
        self.userInfo.set(msg.lpTokenAddress, userInfo);
        // Send remain Ton to owner
        send(SendParameters{
            to: self.owner,
            value: 0,
            mode: SendRemainingValue,
            body: "Deposit Successfully".asComment()
        });
    }
    

    // MasterChef will send this message to MiniChef to comfrim the withdraw and send WithdrawInternalReply to MasterChef to complete the withdraw
    receive(msg: WithdrawInternal) {
        require(sender() == self.masterChef, "only masterChef can withdraw");

        let userInfo: UserInfo = self.userInfo.get(msg.lpTokenAddress)!!;
        require(userInfo.amount >= msg.amount, "insufficient balance");

        userInfo.amount = userInfo.amount - msg.amount;
        userInfo.rewardDebt = userInfo.rewardDebt - msg.rewardDebt; 

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
                beneficiary: msg.beneficiary
            }.toCell()
        });
    }

    // MasterChef will send this message to MiniChef to comfrim the harvest and send HarvestInternalReply to MasterChef to complete the harvest
    receive(msg: HarvestInternal) {
        require(sender() == self.masterChef, "only masterChef can harvest");
        let userInfo: UserInfo = self.userInfo.get(msg.lpTokenAddress)!!;
        let accumulatedReward: Int = userInfo.amount * msg.accRewardPerShare / ACC_PRECISION; 
        let _pendingReward: Int = accumulatedReward - userInfo.rewardDebt;
        if (_pendingReward <= 0) {
            throw(ERROR_NO_REWARD);
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
                beneficiary: msg.beneficiary
            }.toCell()
        });
    
    }

    // User will get all the reward until now and withdraw certain amount of LP token
    receive(msg: WithdrawAndHarvestInternal) {
        require(sender() == self.masterChef, "only masterChef can harvest");
        let userInfo: UserInfo = self.userInfo.get(msg.lpTokenAddress)!!;
        require(userInfo.amount >= msg.withdrawAmount, "insufficient balance");
        let accumulatedReward: Int = userInfo.amount * msg.accRewardPerShare / ACC_PRECISION; 
        let _pendingReward: Int = accumulatedReward - userInfo.rewardDebt;
        if (_pendingReward <= 0) {
            userInfo.amount = userInfo.amount - msg.withdrawAmount;
            userInfo.rewardDebt = userInfo.rewardDebt - msg.withdrawAmount * msg.accRewardPerShare / ACC_PRECISION;
            // Send Withdraw Internal
            self.userInfo.set(msg.lpTokenAddress, userInfo);

            send(SendParameters{
                to: self.masterChef,
                value: 0,
                mode: SendRemainingValue,
                body: WithdrawAndHarvestReply{
                    queryId: msg.queryId,
                    lpTokenAddress: msg.lpTokenAddress,
                    rewardAmount: 0,
                    withdrawAmount: msg.withdrawAmount,
                    sender: self.owner,
                    beneficiary: msg.beneficiary
                }.toCell()
            });
            return ;
        }
        userInfo.rewardDebt = accumulatedReward - msg.withdrawAmount * msg.accRewardPerShare;
        userInfo.amount = userInfo.amount - msg.withdrawAmount;
        self.userInfo.set(msg.lpTokenAddress, userInfo);

        // Send WithdrawAndHarvestReply to MasterChef
        send(SendParameters{
            to: self.masterChef,
            value: 0,
            mode: SendRemainingValue,
            body: WithdrawAndHarvestReply{
                queryId: msg.queryId,
                lpTokenAddress: msg.lpTokenAddress,
                rewardAmount: _pendingReward,
                withdrawAmount: msg.withdrawAmount,
                sender: self.owner,
                beneficiary: msg.beneficiary
            }.toCell()
        });

    }

    // Get Methods // 

    // Get User Info
    get fun getUserInfo(lpTokenAddress: Address): UserInfo {
        require(self.userInfo.get(lpTokenAddress) != null , "user not exists");
        return self.userInfo.get(lpTokenAddress)!!;
    }

    // Get Owner of the MiniChef
    get fun getOwner(): Address {
        return self.owner;
    }

    // Get MasterChef Address
    get fun getMasterChef(): Address {
        return self.masterChef;
    }

}