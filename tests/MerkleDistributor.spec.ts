import {
    Blockchain,
    prettyLogTransactions,
    printTransactionFees,
    SandboxContract,
    TreasuryContract,
} from '@ton/sandbox';
import { Address, beginCell, Cell, comment, Dictionary, toNano } from '@ton/core';
import { JettonWalletUSDT } from '../wrappers/JettonWallet';
import { JettonMasterUSDT } from '../wrappers/JettonMaster';
import '@ton/test-utils';
import { MerkleDistributor } from '../wrappers/MerkleDistributor';

type IBalance = {
    account: Address;
    amount: bigint;
};

const DECIMALS = BigInt(10 ** 6);
const NUMBER_OF_RECEIPIENT = 2000;

class MerkleTree {
    nodes: Buffer[];

    constructor(leafs: Buffer[]) {
        // pad to power of 2
        const power = Math.ceil(Math.log2(leafs.length));
        for (let i = leafs.length; i < Math.pow(2, power); i++) {
            leafs.push(beginCell().storeUint(i, 256).endCell().hash());
        }

        // sort leafs, lower hash first
        leafs = leafs.sort((a, b) => {
            return a.compare(b);
        });

        // Initialize the nodes array with the leaves
        this.nodes = [...leafs];

        // Build the tree
        let currentLevelNodes = leafs;
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

describe('MerkleDistributor', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let users: SandboxContract<TreasuryContract>[];
    let distributor: SandboxContract<MerkleDistributor>;
    let usdt: SandboxContract<JettonMasterUSDT>;
    let balances: IBalance[];
    let totalAirdropAmount: bigint;
    let merkleTree: MerkleTree;
    let leafs: Buffer[];

    function packLeafNodes(balances: IBalance[]) {
        return balances.map((b) => {
            return beginCell().storeAddress(b.account).storeCoins(b.amount).endCell().hash();
        });
    }

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');

        // initialize users
        totalAirdropAmount = 0n;
        users = [];
        balances = [];
        for (let i = 0; i < NUMBER_OF_RECEIPIENT; i++) {
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
        await usdt.send(
            deployer.getSender(),
            { value: toNano('1') },
            {
                $$type: 'JettonMint',
                amount: totalAirdropAmount * 2n,
                origin: deployer.address,
                receiver: deployer.address,
                custom_payload: beginCell().endCell(),
                forward_payload: beginCell().endCell(),
                forward_ton_amount: 0n,
            },
        );

        // deployer usdt wallet
        const deployerJettonWallet = blockchain.openContract(
            await JettonWalletUSDT.fromInit(deployer.address, usdt.address),
        );

        // create merkle tree
        leafs = packLeafNodes(balances);
        merkleTree = new MerkleTree(leafs);

        // deploy distributor contract
        distributor = blockchain.openContract(
            await MerkleDistributor.fromInit(BigInt('0x' + merkleTree.getRoot().toString('hex')), deployer.address),
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

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: distributor.address,
            deploy: true,
            success: true,
        });

        // get distributor contract jetton wallet
        const distributorJettonWallet = blockchain.openContract(
            await JettonWalletUSDT.fromInit(distributor.address, usdt.address),
        );
        const deployerJettonData = await deployerJettonWallet.getGetWalletData();
        expect(deployerJettonData.balance).toEqual(totalAirdropAmount * 2n);

        // setup distributor contract
        const setupResult = await distributor.send(
            deployer.getSender(),
            { value: toNano('0.5') },
            {
                $$type: 'Setup',
                airDropJettonWallet: distributorJettonWallet.address,
            },
        );

        expect(setupResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: distributor.address,
            success: true,
            op: 0x7654321,
        });

        // send airdrop token to distributor
        await deployerJettonWallet.send(
            deployer.getSender(),
            { value: toNano('10') },
            {
                $$type: 'JettonTransfer',
                query_id: 1n,
                amount: totalAirdropAmount,
                destination: distributor.address,
                response_destination: deployer.address,
                forward_payload: beginCell().endCell(),
                forward_ton_amount: 0n,
                custom_payload: beginCell().endCell(),
            },
        );

        // check balance of distributor contract
        const distributorJettonData = await distributorJettonWallet.getGetWalletData();
        expect(distributorJettonData.balance).toEqual(totalAirdropAmount);
    });

    it('Should test deploy', async () => {});

    it('Should get params of distributor contract', async () => {
        const distributorParams = await distributor.getGetParams();
        const distributorJettonWallet = blockchain.openContract(
            await JettonWalletUSDT.fromInit(distributor.address, usdt.address),
        );
        expect(distributorParams.owner.toString()).toEqual(deployer.address.toString());
        expect(distributorParams.airDropJettonWallet.toString()).toEqual(distributorJettonWallet.address.toString());
        expect(distributorParams.merkleRoot).toEqual(BigInt('0x' + merkleTree.getRoot().toString('hex')));
    });

    it('Should claim airdrop for user-1', async () => {
        const leaf = beginCell().storeAddress(users[1].address).storeCoins(balances[1].amount).endCell().hash();

        const proof = merkleTree.getHexProof(leaf);

        // offchain verify proof
        expect(merkleTree.verifyProof(leaf, proof, merkleTree.getRoot())).toBeTruthy();

        let dict = Dictionary.empty(Dictionary.Keys.Uint(32), Dictionary.Values.BigUint(256));
        for (let i = 0; i < proof.length; i++) {
            dict.set(i, BigInt(`0x${proof[i].toString('hex')}`));
        }

        const claimResult = await distributor.send(
            users[1].getSender(),
            { value: toNano('1') },
            {
                $$type: 'Claim',
                amount: balances[1].amount,
                merkleProofSize: BigInt(proof.length),
                merkleProof: dict,
            },
        );

        console.log('user address', users[1].address);
        console.log('distributor address', distributor.address);

        prettyLogTransactions(claimResult.transactions);

        // get distributor contract jetton wallet
        const distributorJettonWallet = blockchain.openContract(
            await JettonWalletUSDT.fromInit(distributor.address, usdt.address),
        );

        // get user-1 jetton wallet
        const userJettonWallet = blockchain.openContract(
            await JettonWalletUSDT.fromInit(users[1].address, usdt.address),
        );

        expect(claimResult.transactions).toHaveTransaction({
            from: users[1].address,
            to: distributor.address,
            success: true,
            op: 0x1234567,
        });

        expect(claimResult.transactions).toHaveTransaction({
            from: distributor.address,
            to: distributorJettonWallet.address,
            success: true,
            op: 0x0f8a7ea5,
        });

        expect(claimResult.transactions).toHaveTransaction({
            from: distributorJettonWallet.address,
            to: userJettonWallet.address,
            success: true,
        });
    });

    it('Should not claim twice for user-1', async () => {
        const leaf = beginCell().storeAddress(users[1].address).storeCoins(balances[1].amount).endCell().hash();

        const proof = merkleTree.getHexProof(leaf);

        // offchain verify proof
        expect(merkleTree.verifyProof(leaf, proof, merkleTree.getRoot())).toBeTruthy();

        let dict = Dictionary.empty(Dictionary.Keys.Uint(32), Dictionary.Values.BigUint(256));
        for (let i = 0; i < proof.length; i++) {
            dict.set(i, BigInt(`0x${proof[i].toString('hex')}`));
        }

        await distributor.send(
            users[1].getSender(),
            { value: toNano('1') },
            {
                $$type: 'Claim',
                amount: balances[1].amount,
                merkleProofSize: BigInt(proof.length),
                merkleProof: dict,
            },
        );

        const getAirdropTwiceResult = await distributor.send(
            users[1].getSender(),
            { value: toNano('1') },
            {
                $$type: 'Claim',
                amount: balances[1].amount,
                merkleProofSize: BigInt(proof.length),
                merkleProof: dict,
            },
        );

        expect(getAirdropTwiceResult.transactions).toHaveTransaction({
            from: distributor.address,
            op: 0x13579,
            success: true,
        });

        expect(getAirdropTwiceResult.transactions).toHaveTransaction({
            to: users[1].address,
            body: comment('Refund'),
            success: true,
        });
    });
});
