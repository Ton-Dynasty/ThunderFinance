import "@stdlib/deploy";
import "./packages/utils/data.fc";

// This function is used to build the metadata uri cell
@name(build_content_cell)
native build_content_cell(metadata_uri: Slice): Cell;

struct PrivateDropParams {
    merkleRoot: Int as uint256;   // the merkle root of the merkle tree
    airDropJettonWallet: Address; // the jetton wallet for distributing the jettons
    owner: Address;               // the owner of the contract
    isInitialized: Bool;          // whether the contract is initialized
    contentCell: Cell;            // the metadata uri cell
}

struct PublicDropParams {
    airDropJettonWallet: Address; // the jetton wallet for distributing the jettons
    totalDrops: Int as uint32;    // the total number of drops
    jettonPerDrop: Int as coins;  // the amount of jettons per drop
    remainingDrops: Int as uint32; // the remaining number of drops
    isInitialized: Bool;          // whether the contract is initialized
    owner: Address;               // the owner of the contract
    contentCell: Cell;            // the metadata uri cell
}

struct DeployInfo {
    stateInit: StateInit; // the state init of the contract
    address: Address;     // the address of the merkle distributor contract
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

/****************************************************
                  Public Airdrop
****************************************************/

message(0x2) CreateAirdropPublic {
    airDropJettonWallet: Address;   // the jetton wallet for distributing the jettons
    totalDrops: Int as uint32;      // the total number of drops
    jettonPerDrop: Int as coins;    // the amount of jettons per drop
    seed: Int as uint256;           // the seed for unique contract address
    metadataUri: Slice;             // the metadata uri
}

/****************************************************
                 Private Airdrop
****************************************************/
message(0x1) CreateAirdropPrivate {
    airDropJettonWallet: Address;   // the jetton wallet for distributing the jettons
    merkleRoot: Int as uint256;     // the merkle root of the merkle tree
    seed: Int as uint256;           // the seed for unique contract address
    metadataUri: Slice;             // the metadata uri
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

    init(_version: Int) {
        self.owner = sender();
    }

    // create a public airdrop contract
    receive(msg: CreateAirdropPublic) {
        let stateInit: StateInit = initOf PublicDistributor(sender(), msg.seed);
        let addr: Address = contractAddress(stateInit);
        send(SendParameters{
            to: addr,
            value: 0,
            mode: SendRemainingBalance,
            body: msg.toCell(),
            code: stateInit.code,
            data: stateInit.data
        });
    }

    // create a new merkle distributor contract
    receive(msg: CreateAirdropPrivate) {
        let stateInit: StateInit = initOf MerkleDistributor(sender(), msg.seed);
        let addr: Address = contractAddress(stateInit);
        send(SendParameters{
            to: addr,
            value: 0,
            mode: SendRemainingBalance,
            body: msg.toCell(),
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


    get fun publicDistributorInfo(owner: Address, seed: Int): DeployInfo {
        let stateInit: StateInit = initOf PublicDistributor(owner, seed);
        let addr: Address = contractAddress(stateInit);
        return DeployInfo{
            stateInit: stateInit,
            address: addr
        };
    }

    get fun merkleDistributorInfo(owner: Address, seed: Int): DeployInfo {
        let stateInit: StateInit = initOf MerkleDistributor(owner, seed);
        let addr: Address = contractAddress(stateInit);
        return DeployInfo{
            stateInit: stateInit,
            address: addr
        };
    }
}

// WARNING: DO NOT DEPLOY THIS CONTRACT DIRECTLY, USE AirdropFactory TO DEPLOY IT
// BECAUSE THE FIRST MESSAGE IS EXPECTED TO BE CreateAirdropPublic
contract PublicDistributor {
    owner: Address;
    airDropJettonWallet: Address;       // the jetton wallet for distributing the jettons
    totalDrops: Int as uint32 = 0;      // the total number of drops, totalDrops * jettonPerDrop should be less than or equal to the amount of jettons in the wallet
    jettonPerDrop: Int as coins = 0;    // the amount of jettons per drop
    remainingDrops: Int as uint32 = 0;  // the remaining number of drops
    isInitialized: Bool = false;        // whether the contract is initialized
    metadata: Cell;                     // the metadata uri cell

    init(owner: Address, _seed: Int) {
        self.owner = owner;
        self.airDropJettonWallet = newAddress(0, 0);
        self.metadata = emptyCell();
    }

    inline fun _calculateIssuerInit(user: Address): StateInit {
        return initOf Issuer(myAddress(), user);
    }

    receive(msg: CreateAirdropPublic) {
        require(!self.isInitialized, "Contract is already initialized");
        self.isInitialized = true;
        self.airDropJettonWallet = msg.airDropJettonWallet;
        self.totalDrops = msg.totalDrops;
        self.jettonPerDrop = msg.jettonPerDrop;
        self.metadata = build_content_cell(msg.metadataUri);
    }

    receive(msg: JettonTransferNotification) {
        require(self.isInitialized, "Contract is not initialized");
        require(self.airDropJettonWallet == sender(), "Invalid sender");
        require(msg.amount >= self.jettonPerDrop * self.totalDrops, "Insufficient amount");
        self.remainingDrops = self.totalDrops;
    }

    receive(msg: IssueResponse) {
        require(self.isInitialized, "Contract is not initialized");
        let expectedSender: Address = contractAddress(self._calculateIssuerInit(msg.receiver));
        require(expectedSender == sender(), "Invalid sender");
        self.remainingDrops -= 1;
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


    receive("claim"){
        require(self.isInitialized, "Contract is not initialized");
        require(self.remainingDrops > 0, "No more drops available");
        let initCode: StateInit = self._calculateIssuerInit(sender());
        send(SendParameters{
            to: contractAddress(initCode),
            value: 0,
            mode: SendRemainingValue,
            body: IssueRequest{
                amount: self.jettonPerDrop
            }.toCell(),
            code: initCode.code,
            data: initCode.data
        });
    }
    
    get fun getParams(): PublicDropParams {
        return PublicDropParams{
            airDropJettonWallet: self.airDropJettonWallet,
            totalDrops: self.totalDrops,
            jettonPerDrop: self.jettonPerDrop,
            remainingDrops: self.remainingDrops,
            isInitialized: self.isInitialized,
            owner: self.owner,
            contentCell: self.metadata
        };
    }
}


// WARNING: DO NOT DEPLOY THIS CONTRACT DIRECTLY, USE AirdropFactory TO DEPLOY IT
// BECAUSE THE FIRST MESSAGE IS EXPECTED TO BE Setup
//
// MerkleDistributor contract is used to distribute jettons to the users
// the contract will check the merkle proof and issue the jettons to the user
contract MerkleDistributor {
    merkleRoot: Int as uint256 = 0;  // the merkle root of the merkle tree
    airDropJettonWallet: Address;    // the jetton wallet for distributing the jettons
    owner: Address;                  // the owner of the contract
    isInitialized: Bool = false;     // whether the contract is initialized
    metadata: Cell;                  // the metadata uri cell

    init(owner: Address, _seed: Int) {
        self.owner = owner;
        self.airDropJettonWallet = newAddress(0, 0);
        self.metadata = emptyCell();
    }

    // only owner can setup the air drop jetton wallet
    receive(msg: CreateAirdropPrivate) {
        require(self.isInitialized == false, "Contract is already initialized");
        self.isInitialized = true;
        self.airDropJettonWallet = msg.airDropJettonWallet;
        self.merkleRoot = msg.merkleRoot;
        self.metadata = build_content_cell(msg.metadataUri);
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
        require(self.isInitialized, "Contract is not initialized");
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
        return initOf Issuer(myAddress(), user);
    }

    // get function
    get fun getParams(): PrivateDropParams {
        return PrivateDropParams{
            merkleRoot: self.merkleRoot,
            airDropJettonWallet: self.airDropJettonWallet,
            owner: self.owner,
            isInitialized: self.isInitialized,
            contentCell: self.metadata
        };
    }
}


// this contract is used to check if the user has claimed the jettons
// if the user has claimed the jettons, the contract will refund the incoming message
contract Issuer {
    distributor: Address;
    owner: Address;
    hasClaimed: Bool = false;

    init(distributor: Address, owner: Address) {
        self.distributor = distributor;
        self.owner = owner;
    }

    receive(msg: IssueRequest) {
        require(self.distributor == sender(), "Invalid sender");
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