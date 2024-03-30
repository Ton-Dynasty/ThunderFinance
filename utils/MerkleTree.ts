import { Address, Dictionary, beginCell } from '@ton/core';

export type IBalance = {
    account: Address; // address of the account
    amount: bigint; // the amount of the airdrop balance
};

export function hashLeafNodes(balances: IBalance[]) {
    return balances.map((b) => {
        return beginCell().storeAddress(b.account).storeCoins(b.amount).endCell().hash();
    });
}

export class MerkleTree {
    nodes: Buffer[];

    constructor(hashedLeafNodes: Buffer[], forceInitialize: boolean = false) {
        if (forceInitialize) {
            // TODO: check if the length is power of 2
            this.nodes = hashedLeafNodes;
            return;
        }
        // pad to power of 2
        const power = Math.ceil(Math.log2(hashedLeafNodes.length));
        for (let i = hashedLeafNodes.length; i < Math.pow(2, power); i++) {
            hashedLeafNodes.push(beginCell().storeUint(i, 256).endCell().hash());
        }

        // sort leafs, lower hash first
        hashedLeafNodes = hashedLeafNodes.sort((a, b) => {
            return a.compare(b);
        });

        // Initialize the nodes array with the leaves
        this.nodes = [...hashedLeafNodes];

        // Build the tree
        let currentLevelNodes = hashedLeafNodes;
        while (currentLevelNodes.length > 1) {
            let nextLevelNodes = [];
            for (let i = 0; i < currentLevelNodes.length; i += 2) {
                // Combine each pair of nodes and hash them together
                let leftNode = currentLevelNodes[i];
                let rightNode = currentLevelNodes[i + 1];
                let combinedHash = this.hashTwoNodes(leftNode, rightNode);
                nextLevelNodes.push(combinedHash);
            }
            // Append the next level nodes to the full list of nodes
            this.nodes = [...nextLevelNodes, ...this.nodes];
            // Prepare for the next iteration
            currentLevelNodes = nextLevelNodes;
        }
    }

    // static
    public static fromLeafs(hashedLeafNodes: Buffer[]) {
        return new MerkleTree(hashedLeafNodes, true);
    }

    getRoot() {
        return this.nodes[0];
    }

    hashTwoNodes(left: Buffer, right: Buffer) {
        // smaller hash first
        if (left.compare(right) > 0) {
            const temp = left;
            left = right;
            right = temp;
        }
        // turn buffer to int
        const leftInt = BigInt('0x' + left.toString('hex'));
        const rightInt = BigInt('0x' + right.toString('hex'));
        return beginCell().storeUint(leftInt, 256).storeUint(rightInt, 256).endCell().hash();
    }

    binarySearch(targetLeaf: Buffer) {
        let left = 0;
        let right = this.nodes.length - 1;

        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const comparisonResult = targetLeaf.compare(this.nodes[mid]);

            if (comparisonResult === 0) {
                // Found the target
                return mid;
            } else if (comparisonResult < 0) {
                // Target is less than mid, discard the right half
                right = mid - 1;
            } else {
                // Target is more than mid, discard the left half
                left = mid + 1;
            }
        }

        // Target not found
        return -1;
    }

    getHexProof(leaf: Buffer) {
        let index = this.binarySearch(leaf);
        if (index === -1) {
            throw new Error('Leaf not found');
        }
        let proof = [];
        let sibling;
        while (index > 0) {
            if (index % 2 !== 0) {
                // If the node is a left node, get the right sibling
                sibling = this.nodes[index + 1];
            } else {
                // If the node is a right node, get the left sibling
                sibling = this.nodes[index - 1];
            }
            // Store the sibling
            proof.push(sibling);
            // Move up the tree
            index = Math.floor((index - 1) / 2);
        }
        return proof;
    }

    verifyProof(leaf: Buffer, proof: Buffer[], root: Buffer) {
        let computedHash = leaf;
        console.log(
            'proofs',
            proof.map((p) => BigInt('0x' + p.toString('hex'))),
        );
        console.log('target leaf', BigInt('0x' + leaf.toString('hex')));
        for (let sibling of proof) {
            computedHash = this.hashTwoNodes(computedHash, sibling);
            console.log('- calculation', BigInt('0x' + computedHash.toString('hex')));
        }

        console.log(
            'nodes',
            this.nodes.map((n) => n.toString('hex')),
        );
        console.log('root', root.toString('hex'));
        return computedHash.compare(root) === 0;
    }
}

export function packBalance(b: IBalance) {
    return beginCell().storeAddress(b.account).storeCoins(b.amount).endCell().hash();
}

export function packProof(proof: Buffer[]) {
    let dict = Dictionary.empty(Dictionary.Keys.Uint(32), Dictionary.Values.BigUint(256));
    for (let i = 0; i < proof.length; i++) {
        dict.set(i, BigInt(`0x${proof[i].toString('hex')}`));
    }
    return dict;
}
