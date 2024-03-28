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

message Claim {
    account: Address; // the address of the account to claim the coins
    amount: Int as coins; // the amount of coins to claim
    // The first element is the number of proof elements in uint32, the rest are the proof elements in Cell
    // For each cell, they should be packed by beginCell().storeUint(..., 256).storeUint(..., 256)...endCell();
    merkleProof: Slice; 
}

contract MerkleDistributor {
    merkleRoot: Int as uint256;
    airDropJettonWallet: Address;
    isInitialized: Bool = false;

    init(merkleRoot: Int, airDropJettonWallet: Address) {
        self.merkleRoot = merkleRoot;
        self.airDropJettonWallet = airDropJettonWallet;
    }


    receive(msg: Claim) {
        let nodeHash: Int = beginCell().storeAddress(msg.account).storeCoins(msg.amount).asSlice().hash();
        let rootHash: Int = self._processProof(nodeHash, msg.merkleProof);
        if (rootHash == self.merkleRoot) {
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
    }

    inline fun _processProof(nodeHash: Int, proof: Slice): Int {
        let length: Int = proof.loadUint(32);
        let remain: Slice = proof.loadRef().asSlice();
        let index: Int = 0;
        let computedHash: Int = nodeHash;
        while (index < length) {
            let elem: Int = remain.loadUint(256);
            computedHash = self._hashPair(computedHash, elem);
            index += 1;
        }
        return computedHash;
    }

    inline fun _hashPair(a: Int, b: Int): Int {
        return a < b ? beginCell().storeUint(a, 256).storeUint(b, 256).asSlice().hash() : beginCell().storeUint(b, 256).storeUint(a, 256).asSlice().hash();
    }
}