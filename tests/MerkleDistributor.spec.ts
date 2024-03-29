import { Blockchain, printTransactionFees, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, toNano } from '@ton/core';
import { JettonWalletUSDT } from '../wrappers/JettonWallet';
import { JettonMasterUSDT } from '../wrappers/JettonMaster';
import '@ton/test-utils';
import { MerkleDistributor } from '../wrappers/MerkleDistributor';

type IBalance = {
    account: Address;
    amount: bigint;
};

const DECIMALS = BigInt(10 ** 6);

class MerkleTree {
    nodes: Buffer[];

    constructor(leaves: Buffer[]) {
        // Check if leaves length is a power of 2
        const isPowerOfTwo = leaves.length && (leaves.length & (leaves.length - 1)) === 0;
        if (!isPowerOfTwo) {
            throw new Error('Invalid number of nodes: Must be a power of 2.');
        }

        // Initialize the nodes array with the leaves
        this.nodes = [...leaves]; // Make a shallow copy of leaves to preserve original array

        // Build the tree
        let currentLevelNodes = leaves;
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
        console.log(
            'Tree nodes: ',
            this.nodes.map((n) => n.toString('hex')),
        );
    }

    getRoot() {
        return this.nodes[0];
    }

    hashTwoNodes(left: Buffer, right: Buffer) {
        if (left > right) {
            let temp = left;
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
        let isLeftNode = false;
        while (index > 0) {
            if (index % 2 === 0) {
                // If the node is a left node, get the right sibling
                sibling = this.nodes[index + 1];
                isLeftNode = true;
            } else {
                // If the node is a right node, get the left sibling
                sibling = this.nodes[index - 1];
                isLeftNode = false;
            }
            // Store the sibling
            proof.push(sibling);
            // Move up the tree
            index = Math.floor((index - 1) / 2);
        }
        return proof;
    }
}

describe('MerkleDistributor', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let users: SandboxContract<TreasuryContract>[];
    let distributor: SandboxContract<MerkleDistributor>;
    let usdt: SandboxContract<JettonMasterUSDT>;
    let balances: IBalance[];
    let totalAirdropAmount: bigint;
    let merkleTree: MerkleTree;

    function packLeafNodes(balances: IBalance[]) {
        let nodes = balances.map((b) => {
            return beginCell().storeAddress(b.account).storeCoins(b.amount).endCell().hash();
        });
        // print node 0
        console.log('Node 0: ', nodes[0].toString('hex'));
        // print node 1
        console.log('Node 1: ', nodes[1].toString('hex'));
        // pad to power of 2, use log
        const power = Math.ceil(Math.log2(balances.length));
        for (let i = balances.length; i < Math.pow(2, power); i++) {
            nodes.push(beginCell().endCell().hash());
        }
        console.log('Length of nodes: ', nodes.length);
        return nodes;
    }

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');

        // initialize users
        totalAirdropAmount = 0n;
        users = [];
        balances = [];
        for (let i = 0; i < 6; i++) {
            let _amount = BigInt(i + 1) * DECIMALS;
            users.push(await blockchain.treasury(`user-${i}`));
            balances.push({
                account: users[i].address,
                amount: _amount,
            });
            totalAirdropAmount += _amount;
        }

        // mint airdrop token
        usdt = blockchain.openContract(await JettonMasterUSDT.fromInit(deployer.address, beginCell().endCell()));
        await usdt.send(deployer.getSender(), { value: toNano('1') }, 'Mint:1');

        // create merkle tree
        const nodes = packLeafNodes(balances);
        merkleTree = new MerkleTree(nodes);

        // open distributor contract
        distributor = blockchain.openContract(
            await MerkleDistributor.fromInit(BigInt('0x' + merkleTree.getRoot().toString('hex'))),
        );

        const deployResult = await distributor.send(
            deployer.getSender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'Deploy',
                queryId: 0n,
            },
        );

        // send airdrop token to distributor
        const deployerJettonWallet = blockchain.openContract(
            await JettonWalletUSDT.fromInit(deployer.address, usdt.address),
        );
        deployerJettonWallet.send(
            deployer.getSender(),
            { value: toNano('1') },
            {
                $$type: 'JettonTransfer',
                query_id: 1n,
                amount: totalAirdropAmount,
                destination: distributor.address,
                response_destination: distributor.address,
                forward_payload: beginCell().storeUint(1, 1).endCell(),
                forward_ton_amount: 0n,
                custom_payload: beginCell().endCell(),
            },
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: distributor.address,
            deploy: true,
            success: true,
        });
    });

    it('Should test deploy', async () => {});

    it('Should claim airdrop for user-1', async () => {
        const leaf = packLeafNodes(balances);
        console.log("All leaves",leaf.map(l=>l.toString('hex')))
        const proof = merkleTree.getHexProof(leaf[1]);
        const merkleProof = beginCell();
        merkleProof.storeUint(proof.length, 32);
        console.log('Proof length: ', proof.length);
        for (let i = 0; i < proof.length; i++) {
            merkleProof.storeUint(BigInt(`0x${proof[i].toString('hex')}`), 256);
        }
        await distributor.send(
            users[1].getSender(),
            { value: toNano('0.5') },
            {
                $$type: 'Claim',
                account: balances[1].account,
                amount: balances[1].amount,
                merkleProof: merkleProof.endCell(),
            },
        );
    });
});
