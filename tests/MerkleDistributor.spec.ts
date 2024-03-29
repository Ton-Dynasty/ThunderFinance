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
import { AirdropFactory } from '../wrappers/AirdropFactory';
import { MerkleTree, IBalance, hashLeafNodes, packProof } from '../utils/MerkleTree';

const DECIMALS = BigInt(10 ** 6);
const NUMBER_OF_RECEIPIENT = 2000;

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
    let airdropFactory: SandboxContract<AirdropFactory>;

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
        leafs = hashLeafNodes(balances);
        merkleTree = new MerkleTree(leafs);

        // deploy airdrop factory contract
        airdropFactory = blockchain.openContract(await AirdropFactory.fromInit(BigInt(1)));

        const aridropFactoryDeployResult = await airdropFactory.send(
            deployer.getSender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'Deploy',
                queryId: 0n,
            },
        );

        expect(aridropFactoryDeployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: airdropFactory.address,
            deploy: true,
            success: true,
        });

        // get distributor contract jetton wallet
        const info = await airdropFactory.getMerkleDistributorInfo(deployer.address);
        const distributorJettonWallet = blockchain.openContract(
            await JettonWalletUSDT.fromInit(info.address, usdt.address),
        );

        // deploy distributor contract
        const distributorDeployResult = await airdropFactory.send(
            deployer.getSender(),
            {
                value: toNano('0.5'),
            },
            {
                $$type: 'CreateAirdrop',
                merkleRoot: BigInt('0x' + merkleTree.getRoot().toString('hex')),
                airDropJettonWallet: distributorJettonWallet.address,
            },
        );

        distributor = blockchain.openContract(await MerkleDistributor.fromInit(deployer.address, info.seed));

        expect(distributorDeployResult.transactions).toHaveTransaction({
            from: airdropFactory.address,
            to: distributor.address,
            success: true,
            deploy: true,
            op: 0x7654321,
        });

        const deployerJettonData = await deployerJettonWallet.getGetWalletData();
        expect(deployerJettonData.balance).toEqual(totalAirdropAmount * 2n);

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

        let dict = packProof(proof);

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

        let dict = packProof(proof);

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
