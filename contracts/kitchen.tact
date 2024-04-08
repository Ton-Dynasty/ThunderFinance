import "@stdlib/deploy";
import "./packages/token/jetton/JettonMaster.tact";
import "./packages/utils/data.fc";
import "./messages.tact";
import "./jetton_master_chef.tact";
import "./ton_master_chef.tact";
// Kithcen Contract (MasterChef Factory) is used to deploy the MasterChef
contract Kitchen with Deployable {
    owner: Address;
    version: Int;
    init(_owner: Address, _version: Int) {
        self.owner = _owner;
        self.version = _version;
    }

    // Deploy MasterChef for jetton
    receive(msg: BuildJettonMasterChef) {
        let initCode: StateInit = self._calculateJettonMasterChef(msg.owner,msg.seed);
        send(SendParameters{
                to: contractAddress(initCode),
                value: 0,
                mode: SendRemainingValue,
                body: SetUpJettonMC{
                    owner: msg.owner,
                    thunderMintWallet: msg.thunderMintWallet,
                    thunderMintJettonWallet: msg.thunderMintJettonWallet,
                    mcRewardJettonWallet: msg.mcRewardJettonWallet,
                    metaData: msg.metaData,
                    totalReward: msg.totalReward,
                    deadline: msg.deadline
                }.toCell(),
                code: initCode.code,
                data: initCode.data
            }
        );
    }

    // Deploy MasterChef for TON
    receive(msg: BuildTonMasterChef) {
        let initCode: StateInit = self._calculateTonMasterChef(msg.owner,msg.seed);
        send(SendParameters{
                to: contractAddress(initCode),
                value: 0,
                mode: SendRemainingValue,
                body: SetUpForTonMC{
                    owner: msg.owner,
                    thunderMintWallet: msg.thunderMintWallet,
                    metaData: msg.metaData,
                    totalReward: msg.totalReward,
                    deadline: msg.deadline
                }.toCell(),
                code: initCode.code,
                data: initCode.data
            }
        );
    }

    // Internal Functions //

    // Calculate Jetton MasterChef init code
    inline fun _calculateJettonMasterChef(owner: Address, seed: Int): StateInit {
        return initOf JettonMasterChef(owner,seed);
    }

    // Calculate TonMasterChef init code
    inline fun _calculateTonMasterChef(owner: Address, seed: Int): StateInit {
        return initOf TonMasterChef(owner,seed);
    }

    // Get Methods //

    // Get Jetton MasterChef address by its owner and seed
    get fun getJettonMasterChefAddress(owner: Address, seed: Int): Address {
        let initCode: StateInit = self._calculateJettonMasterChef(owner, seed);
        return contractAddress(initCode);
    }

    // Get Ton MasterChef address by its owner and seed
    get fun getTonMasterChefAddress(owner: Address, seed: Int): Address {
        let initCode: StateInit = self._calculateTonMasterChef(owner, seed);
        return contractAddress(initCode);
    }
}