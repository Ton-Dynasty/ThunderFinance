import "@stdlib/deploy";

struct Params {
    merkleRoot: Int as uint256;   // the merkle root of the merkle tree
    airDropJettonWallet: Address; // the jetton wallet for distributing the jettons
    owner: Address;               // the owner of the contract
    isInitialized: Bool;          // whether the contract is initialized
}

struct DeployInfo {
    stateInit: StateInit; // the state init of the contract
    address: Address;     // the address of the merkle distributor contract
    seed: Int;            // the seed of the contract
}

message(0x0f8a7ea5) JettonTransfer {
    query_id: Int as uint64;                // arbitrary request number
    amount: Int as coins;                   // amount of jettons to transfer
    destination: Address;                   // address of the new owner of the jettons
    response_destination: Address;          // address where to send a response with confirmation of a successful transfer and the rest of the incoming message Toncoins.
    custom_payload: Cell?;                  // optional custom payload
    forward_ton_amount: Int as coins;       // the amount of nanotons to be sent to the destination address.
    forward_payload: Slice as remaining;    // optional custom data that should be sent to the destination address.
}

message(0x7362d09c) JettonTransferNotification {
    query_id: Int as uint64;                // arbitrary request number
    amount: Int as coins;                   // amount of jettons to transfer
    sender: Address;                        // address of the sender of the jettons
    forward_payload: Slice as remaining;    // optional custom payload
}

message(0x7654321) Setup {
    airDropJettonWallet: Address;   // the jetton wallet for distributing the jettons
    merkleRoot: Int as uint256;     // the merkle root of the merkle tree
}

message(0x1) CreateAirdrop {
    airDropJettonWallet: Address;   // the jetton wallet for distributing the jettons
    merkleRoot: Int as uint256;     // the merkle root of the merkle tree
}

message(0x1234567) Claim {
    amount: Int as coins; // the amount of coins to claim
    merkleProofSize: Int as uint32; // the number of elements in the merkle proof
    merkleProof: map<Int as uint32, Int as uint256>; // the merkle proof array
}

message(0x13579) IssueRequest {
    amount: Int as coins; // the amount of jettons to issue
}

message (0x24680) IssueResponse {
    amount: Int as coins; // the amount of jettons issued
    receiver: Address;    // the address of the receiver
}

contract AirdropFactory with Deployable {
    owner: Address;
    totalDeployed: Int = 0;

    init(_version: Int) {
        self.owner = sender();
    }

    // create a new merkle distributor contract
    receive(msg: CreateAirdrop) {
        let stateInit: StateInit = self._calcMerkleDistributorInit(sender());
        let addr: Address = contractAddress(stateInit);
        self.totalDeployed += 1;
        send(SendParameters{
            to: addr,
            value: 0,
            mode: SendRemainingBalance,
            body: Setup{
                airDropJettonWallet: msg.airDropJettonWallet,
                merkleRoot: msg.merkleRoot
            }.toCell(),
            code: stateInit.code,
            data: stateInit.data
        });
    }

    // owner can withdraw remaining toncoins from this contract
    receive("withdraw") {
        require(self.owner == sender(), "Only the owner can withdraw");
        send(SendParameters{
            to: self.owner,
            value: 0,
            mode: SendRemainingBalance,
            body: "withdraw".asComment()
        });
    }

    // receive any donation, just ignore it
    receive(src: Slice) {}

    inline fun _calcMerkleDistributorInit(owner: Address): StateInit {
        return initOf MerkleDistributor(owner, self.totalDeployed);
    }

    get fun merkleDistributorInfo(owner: Address): DeployInfo {
        let stateInit: StateInit = self._calcMerkleDistributorInit(owner);
        let addr: Address = contractAddress(stateInit);
        return DeployInfo{
            stateInit: stateInit,
            address: addr,
            seed: self.totalDeployed
        };
    }
}

// WARNING: DO NOT DEPLOY THIS CONTRACT DIRECTLY, USE AirdropFactory TO DEPLOY IT
// BECAUSE THE FIRST MESSAGE IS ASSUME TO BE Setup
//
// MerkleDistributor contract is used to distribute jettons to the users
// the contract will check the merkle proof and issue the jettons to the user
contract MerkleDistributor {
    merkleRoot: Int as uint256 = 0;      // the merkle root of the merkle tree
    airDropJettonWallet: Address;    // the jetton wallet for distributing the jettons
    owner: Address;                  // the owner of the contract
    isInitialized: Bool = false;     // whether the contract is initialized

    init(owner: Address, _seed: Int) {
        self.owner = owner;
        self.airDropJettonWallet = newAddress(0, 0);
    }

    // only owner can setup the air drop jetton wallet
    receive(msg: Setup) {
        require(self.isInitialized == false, "Contract is already initialized");
        self.isInitialized = true;
        self.airDropJettonWallet = msg.airDropJettonWallet;
        self.merkleRoot = msg.merkleRoot;
    }

    // user can upload the merkle proof to claim the jettons
    receive(msg: Claim) {
        let ctx: Context = context();
        require(self.isInitialized, "Contract is not initialized");
        let nodeHash: Int = beginCell().storeAddress(ctx.sender).storeCoins(msg.amount).asSlice().hash();
        let rootHash: Int = self._processProof(nodeHash, msg.merkleProofSize, msg.merkleProof);
        require(self.merkleRoot == rootHash, "Invalid merkle proof");
        let initCode: StateInit = self._calculateIssuerInit(ctx.sender);
        send(SendParameters{
            to: contractAddress(initCode),
            value: 0,
            mode: SendRemainingValue,
            body: IssueRequest{
                amount: msg.amount
            }.toCell(),
            code: initCode.code,
            data: initCode.data
        });
    }

    receive(msg: IssueResponse) {
        let expectedSender: Address = contractAddress(self._calculateIssuerInit(msg.receiver));
        require(expectedSender == sender(), "Invalid sender");
        send(SendParameters{
            to: self.airDropJettonWallet,
            value: 0,
            mode: SendRemainingValue,
            body: JettonTransfer{
                query_id: 0,
                amount: msg.amount,
                destination: msg.receiver,
                response_destination: msg.receiver,
                custom_payload: null,
                forward_ton_amount: 0,
                forward_payload: emptySlice()
            }.toCell()
        });
    }

    // process and validate the merkle proof
    inline fun _processProof(nodeHash: Int, size: Int, proof: map<Int as uint32, Int as uint256>): Int {
        let index: Int = 0;
        let computedHash: Int = nodeHash;
        while (index < size) {
            let elem: Int = proof.get(index)!!;
            computedHash = self._hashPair(computedHash, elem);
            index += 1;
        }
        return computedHash;
    }

    // the smallest hash should be the first argument when hashing pair of hashes
    inline fun _hashPair(a: Int, b: Int): Int {
        return a < b ? beginCell().storeUint(a, 256).storeUint(b, 256).asSlice().hash() : beginCell().storeUint(b, 256).storeUint(a, 256).asSlice().hash();
    }

    // get issuer state init
    inline fun _calculateIssuerInit(user: Address): StateInit {
        return initOf MerkleIssuer(myAddress(), user);
    }

    // get function
    get fun getParams(): Params {
        return Params{
            merkleRoot: self.merkleRoot,
            airDropJettonWallet: self.airDropJettonWallet,
            owner: self.owner,
            isInitialized: self.isInitialized
        };
    }
}

// this contract is used to check if the user has claimed the jettons
// if the user has claimed the jettons, the contract will refund the incoming message
contract MerkleIssuer {
    distributor: Address;
    owner: Address;
    hasClaimed: Bool = false;

    init(distributor: Address, owner: Address) {
        self.distributor = distributor;
        self.owner = owner;
    }

    receive(msg: IssueRequest) {
        if (self.hasClaimed) {
            send(SendParameters{
                to: self.owner,
                value: 0,
                mode: SendRemainingValue + SendIgnoreErrors,
                body: "Refund".asComment()
            });
            return;
        }
        self.hasClaimed = true;
        send(SendParameters{
            to: self.distributor,
            value: 0,
            mode: SendRemainingValue,
            body: IssueResponse{
                amount: msg.amount,
                receiver: self.owner
            }.toCell()
        });
    }
}