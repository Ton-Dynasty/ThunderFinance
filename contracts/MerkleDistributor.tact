import "@stdlib/deploy";

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


struct Params {
    merkleRoot: Int as uint256;   // the merkle root of the merkle tree
    airDropJettonWallet: Address; // the jetton wallet for distributing the jettons
    owner: Address;               // the owner of the contract
    isInitialized: Bool;          // whether the contract is initialized
}

message(0x7654321) Setup {
    airDropJettonWallet: Address; // the jetton wallet for distributing the jettons
}


message(0x1234567) Claim {
    account: Address;     // the address of the account to claim the coins
    amount: Int as coins; // the amount of coins to claim
    merkleProofSize: Int as uint32; // the number of elements in the merkle proof
    merkleProof: map<Int as uint32, Int as uint256>; // the merkle proof array
}

contract MerkleDistributor with Deployable {
    merkleRoot: Int as uint256;      // the merkle root of the merkle tree
    airDropJettonWallet: Address;    // the jetton wallet for distributing the jettons
    owner: Address;                  // the owner of the contract
    isInitialized: Bool = false;     // whether the contract is initialized

    // use merkle root and owner address to get an unique address
    init(merkleRoot: Int, owner: Address) {
        self.merkleRoot = merkleRoot;
        self.owner = owner;
        self.airDropJettonWallet = newAddress(0, 0);
    }

    // only owner can setup the air drop jetton wallet
    receive(msg: Setup) {
        require(self.isInitialized == false, "Contract is already initialized");
        require(self.owner == sender(), "Only the owner can initialize the contract");
        self.isInitialized = true;
        self.airDropJettonWallet = msg.airDropJettonWallet;
    }


    // user can upload the merkle proof to claim the jettons
    receive(msg: Claim) {
        require(self.isInitialized, "Contract is not initialized");
        let nodeHash: Int = beginCell().storeAddress(msg.account).storeCoins(msg.amount).asSlice().hash();
        let rootHash: Int = self._processProof(nodeHash, msg.merkleProofSize, msg.merkleProof);
        require(self.merkleRoot == rootHash, "Invalid merkle proof");
        send(SendParameters{
            to: self.airDropJettonWallet,
            value: 0,
            mode: SendRemainingValue,
            body: JettonTransfer{
                query_id: 0,
                amount: msg.amount,
                destination: msg.account,
                response_destination: msg.account,
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