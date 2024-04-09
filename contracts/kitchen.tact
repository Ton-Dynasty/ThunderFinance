import "@stdlib/deploy";
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

    // TODO: remove msg.thunderMintWallet from msg, change to owner @ipromise2324
    // Deploy MasterChef for jetton
    receive(msg: BuildJettonMasterChef) {
        let initCode: StateInit = self.calculateJettonMasterChef(msg.owner,msg.seed);
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

    // TODO: remove msg.thunderMintWallet from msg, change to owner @ipromise2324
    // Deploy MasterChef for TON
    receive(msg: BuildTonMasterChef) {
        let initCode: StateInit = self.calculateTonMasterChef(msg.owner,msg.seed);
        send(SendParameters{
                to: contractAddress(initCode),
                value: 0,
                mode: SendRemainingValue,
                body: SetUpTonMC{
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
    inline fun calculateJettonMasterChef(owner: Address, seed: Int): StateInit {
        return initOf JettonMasterChef(owner,seed);
    }

    // Calculate TonMasterChef init code
    inline fun calculateTonMasterChef(owner: Address, seed: Int): StateInit {
        return initOf TonMasterChef(owner,seed);
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