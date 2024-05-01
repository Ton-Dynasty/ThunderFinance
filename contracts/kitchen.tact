import "@stdlib/deploy";
import "./packages/utils/data.fc";
import "./messages.tact";
import "./jetton_master_chef.tact";
import "./ton_master_chef.tact";

// Kithcen Contract (MasterChef Factory) is used to deploy the MasterChef
contract Kitchen with Deployable {
    owner: Address;

    init(_owner: Address, _version: Int) {
        self.owner = _owner;
    }

    // Deploy MasterChef for jetton
    receive(msg: BuildJettonMasterChef) {
        let initCode: StateInit = self.calculateJettonMasterChef(msg.owner,msg.seed);
        send(SendParameters{
                to: contractAddress(initCode),
                value: 0,
                mode: SendRemainingValue,
                body: SetUpJettonMC{
                    owner: msg.owner,
                    thunderMintWallet: self.owner,
                    mcRewardJettonWallet: msg.mcRewardJettonWallet,
                    metaData: msg.metaData,
                    totalReward: msg.totalReward,
                    deadline: msg.deadline,
                    startTime: msg.startTime,
                    queryId: msg.queryId
                }.toCell(),
                code: initCode.code,
                data: initCode.data
            }
        );
    }

    // Deploy MasterChef for TON
    receive(msg: BuildTonMasterChef) {
        let initCode: StateInit = self.calculateTonMasterChef(msg.owner,msg.seed);
        send(SendParameters{
                to: contractAddress(initCode),
                value: 0,
                mode: SendRemainingValue,
                body: SetUpTonMC{
                    owner: msg.owner,
                    thunderMintWallet: self.owner,
                    metaData: msg.metaData,
                    totalReward: msg.totalReward,
                    deadline: msg.deadline,
                    startTime: msg.startTime,
                    queryId: msg.queryId
                }.toCell(),
                code: initCode.code,
                data: initCode.data
            }
        );
    }

    // Internal Functions //

    // Calculate Jetton MasterChef init code
    inline fun calculateJettonMasterChef(owner: Address, seed: Int): StateInit {
        return initOf JettonMasterChef(owner, seed);
    }

    // Calculate TonMasterChef init code
    inline fun calculateTonMasterChef(owner: Address, seed: Int): StateInit {
        return initOf TonMasterChef(owner, seed);
    }

    // Get Methods //

    // Get Jetton MasterChef address by its owner and seed
    get fun getJettonMasterChefAddress(owner: Address, seed: Int): Address {
        let initCode: StateInit = self.calculateJettonMasterChef(owner, seed);
        return contractAddress(initCode);
    }

    // Get Ton MasterChef address by its owner and seed
    get fun getTonMasterChefAddress(owner: Address, seed: Int): Address {
        let initCode: StateInit = self.calculateTonMasterChef(owner, seed);
        return contractAddress(initCode);
    }
}