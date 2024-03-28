import { Blockchain, printTransactionFees, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, toNano } from '@ton/core';
import { MasterChef, PoolInfo } from '../wrappers/MasterChef';
import { JettonWalletUSDT } from '../wrappers/JettonWallet';
import { JettonMasterUSDT } from '../wrappers/JettonMaster';
import '@ton/test-utils';

describe('PoolFactory', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let user: SandboxContract<TreasuryContract>;
    let masterChef: SandboxContract<MasterChef>;
    let usdt: SandboxContract<JettonMasterUSDT>;
    let masterChefJettonWallet: SandboxContract<JettonWalletUSDT>;
    let deployerJettonWallet: SandboxContract<JettonWalletUSDT>;
    let masterChefJettonWalletAddress: Address;

    async function jettonTransfer(
        usdt: SandboxContract<JettonMasterUSDT>,
        user: SandboxContract<TreasuryContract>,
        masterChef: SandboxContract<MasterChef>,
    ) {
        await usdt.send(user.getSender(), { value: toNano('1') }, 'Mint:1');
        const userJettonWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(user.address, usdt.address));
        return await userJettonWallet.send(
            user.getSender(),
            { value: toNano('1.1') },
            {
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: 1n * 10n ** 6n,
                destination: masterChef.address,
                response_destination: user.address,
                custom_payload: null,
                forward_ton_amount: toNano('1'),
                forward_payload: beginCell().endCell(),
            },
        );
    }

    async function setup(
        masterChef: SandboxContract<MasterChef>,
        masterChefJettonWallet: SandboxContract<JettonWalletUSDT>,
    ) {
        return await masterChef.send(
            deployer.getSender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'SetUp',
                rewardWallet: masterChefJettonWallet.address,
            },
        );
    }

    async function initialize(
        masterChef: SandboxContract<MasterChef>,
        deployerJettonWallet: SandboxContract<JettonWalletUSDT>,
        deployer: SandboxContract<TreasuryContract>,
        rewardPerSecond = 1n * 10n ** 5n,
        rewardPeriod = 1000,
    ) {
        const deadline = blockchain.now!! + rewardPeriod;
        const rewardAmount = rewardPerSecond * BigInt(rewardPeriod);
        const initResult = await deployerJettonWallet.send(
            deployer.getSender(),
            {
                value: toNano('1.5'),
            },
            {
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: rewardAmount,
                destination: masterChef.address,
                response_destination: deployer.address,
                custom_payload: null,
                forward_ton_amount: toNano('1'),
                forward_payload: beginCell().storeCoins(rewardPerSecond).storeUint(deadline, 64).endCell(),
            },
        );

        const masterChefData = await masterChef.getGetMasterChefData();
        return masterChefData.isInitialized;
    }

    async function addPool(
        masterChef: SandboxContract<MasterChef>,
        masterChefJettonWallet: SandboxContract<JettonWalletUSDT>,
    ) {
        return await masterChef.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'AddPool',
                lpTokenAddress: masterChefJettonWallet.address,
                allocPoint: 100n,
            },
        );
    }

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        blockchain.now = Math.floor(Date.now() / 1000);
        deployer = await blockchain.treasury('deployer');
        user = await blockchain.treasury('user');
        usdt = blockchain.openContract(await JettonMasterUSDT.fromInit(deployer.address, beginCell().endCell()));
        masterChef = blockchain.openContract(await MasterChef.fromInit(deployer.address));
        masterChefJettonWallet = blockchain.openContract(
            await JettonWalletUSDT.fromInit(masterChef.address, usdt.address),
        );

        await usdt.send(deployer.getSender(), { value: toNano('1') }, 'Mint:1');
        deployerJettonWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(deployer.address, usdt.address));

        const deployResult = await masterChef.send(
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
            to: masterChef.address,
            deploy: true,
            success: true,
        });

        const setUpResult = await setup(masterChef, masterChefJettonWallet);
        expect(setUpResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: masterChef.address,
            success: true,
            op: 0xec847480,
        });

        const isInitialized = await initialize(masterChef, deployerJettonWallet, deployer);
        expect(isInitialized).toBe(true);
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and poolFactory are ready to use
    });

    it('should setup', async () => {
        // the check is done inside beforeEach
    });

    it('should initialize Master Chef', async () => {
        // the check is done inside beforeEach
    });

    it('Should add pool', async () => {
        const allocPoint = 100n;
        const addPoolResult = await masterChef.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'AddPool',
                lpTokenAddress: masterChefJettonWallet.address,
                allocPoint: allocPoint,
            },
        );

        // Send AddPool to MasterChef
        expect(addPoolResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: masterChef.address,
            success: true,
            op: 0x4b7d1ae4,
        });

        let poolData: PoolInfo = await masterChef.getGetPoolInfo(masterChefJettonWallet.address);
        // allocPoint should be equal to 100
        expect(poolData.allocPoint).toBe(allocPoint);

        // poolData.lpToken should be equal to masterChefJettonWallet.address
        expect(poolData.lpTokenAddress.toString()).toBe(masterChefJettonWallet.address.toString());
    });

    // it('Should deposit and harvest', async () => {});

    // it('Should deposit and withdraw', async () => {});

    // it('Should deposit and withdarw with harvest', async () => {});
});
