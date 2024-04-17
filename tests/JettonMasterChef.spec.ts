import { Kitchen } from '../wrappers/Kitchen';
import { Blockchain, printTransactionFees, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, toNano } from '@ton/core';
import { JettonMasterChef, PoolInfo } from '../wrappers/JettonMasterChef';
import { MiniChef } from '../wrappers/MiniChef';
import { JettonWalletUSDT } from '../wrappers/JettonWallet';
import { JettonMasterUSDT } from '../wrappers/JettonMaster';
import '@ton/test-utils';
import * as fs from 'fs';

describe('Jetton MasterChef Tests', () => {
    let blockchain: Blockchain;
    let ThunderFi: SandboxContract<TreasuryContract>;
    let deployer: SandboxContract<TreasuryContract>;
    let user: SandboxContract<TreasuryContract>;
    let masterChef: SandboxContract<JettonMasterChef>;
    let usdt: SandboxContract<JettonMasterUSDT>;
    let usdc: SandboxContract<JettonMasterUSDT>;

    let masterChefJettonWallet: SandboxContract<JettonWalletUSDT>;
    let deployerJettonWallet: SandboxContract<JettonWalletUSDT>;
    let thunderFiJettonWallet: SandboxContract<JettonWalletUSDT>;
    let kitchen: SandboxContract<Kitchen>;
    let rewardPerSecond: bigint;
    let seed: bigint;
    let deadline: bigint;
    let totalReward: bigint;
    let masterChefJettonWalletAddress: Address;
    const ACC_PRECISION = 10n ** 12n;
    const TOKEN_DECIMALS = 10n ** 6n;
    const gasFile = 'JettonMasterChefCosts.txt';

    // Helper function to append data to a file
    function appendToFile(filename: string, data: string) {
        fs.appendFileSync(filename, data + '\n', 'utf8'); // Append data with a newline at the end
    }

    // Helper function to clear data in a file
    function clearFile(filename: string) {
        fs.writeFileSync(filename, 'Jetton MasterChef Costs in each operation: \n', 'utf8'); // Clear the file
    }

    // User deposits USDT to MasterChef by send JettonTransfer to his JettonWallet
    async function depositJetton(
        usdt: SandboxContract<JettonMasterUSDT>,
        user: SandboxContract<TreasuryContract>,
        masterChef: SandboxContract<JettonMasterChef>,
        amount: bigint,
    ) {
        await usdt.send(user.getSender(), { value: toNano('1') }, 'Mint:1');
        const userJettonWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(user.address, usdt.address));
        return await userJettonWallet.send(
            user.getSender(),
            { value: toNano('1.1') },
            {
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: amount,
                destination: masterChef.address,
                response_destination: user.address,
                custom_payload: null,
                forward_ton_amount: toNano('1'),
                forward_payload: beginCell().endCell(),
            },
        );
    }

    // Initialize MasterChef by sending Reward to MasterChef JettonWallet
    async function initialize(
        masterChef: SandboxContract<JettonMasterChef>,
        deployerJettonWallet: SandboxContract<JettonWalletUSDT>,
        deployer: SandboxContract<TreasuryContract>,
    ) {
        const ownerBalanceBefore = (await deployerJettonWallet.getGetWalletData()).balance;
        const thunderFiBalanceBefore = (await thunderFiJettonWallet.getGetWalletData()).balance;
        const feeAmont = (totalReward * 3n) / 1000n;
        const initResult = await deployerJettonWallet.send(
            deployer.getSender(),
            {
                value: toNano('1.5'),
            },
            {
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: totalReward + feeAmont,
                destination: masterChef.address,
                response_destination: deployer.address,
                custom_payload: null,
                forward_ton_amount: toNano('1'),
                forward_payload: beginCell().endCell(),
            },
        );
        const ownerBalanceAfter = (await deployerJettonWallet.getGetWalletData()).balance;
        const thunderFiBalanceAfter = (await thunderFiJettonWallet.getGetWalletData()).balance;
        // Deployer Should send totalReward + feeAmont to MasterChef JettonWallet
        expect(ownerBalanceBefore - ownerBalanceAfter).toBe(totalReward + feeAmont);

        // MasterChef should send FeeForDevs(Jetton) to ThunderFi JettonWallet
        expect(initResult.transactions).toHaveTransaction({
            from: masterChefJettonWallet.address,
            to: thunderFiJettonWallet.address,
            success: true,
        });

        // ThunderFi JettonWallet should receive FeeForDevs(Jetton)
        expect(thunderFiBalanceAfter - thunderFiBalanceBefore).toBe(feeAmont);

        rewardPerSecond = await (await masterChef.getGetJettonMasterChefData()).rewardPerSecond;

        // Deployer Should send JettonTransfer to his wallet
        expect(initResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: deployerJettonWallet.address,
            success: true,
        });

        // deployerJettonWallet send jetton to MasterChef JettonWallet
        expect(initResult.transactions).toHaveTransaction({
            from: deployerJettonWallet.address,
            to: masterChefJettonWallet.address,
            success: true,
        });

        // MasterChef should send JettonNotify to MasterChef
        expect(initResult.transactions).toHaveTransaction({
            from: masterChefJettonWallet.address,
            to: masterChef.address,
            success: true,
        });

        const masterChefData = await masterChef.getGetJettonMasterChefData();
        // Make sure that jetton For ThunderMint is recorded
        expect(masterChefData.feeForDevs).toEqual((totalReward * 3n) / 1000n);
        return true; //masterChefData.isInitialized;
    }

    // Add a pool to MasterChef
    async function addPool(
        masterChef: SandboxContract<JettonMasterChef>,
        masterChefJettonWallet: SandboxContract<JettonWalletUSDT>,
        allocPoint = 100n,
    ) {
        return await masterChef.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'AddPool',
                lpTokenAddress: masterChefJettonWallet.address,
                allocPoint: allocPoint,
            },
        );
    }

    // Owner of MasterChef deposits reward token first, then user deposits USDT
    async function deposit(
        masterChef: SandboxContract<JettonMasterChef>,
        user: SandboxContract<TreasuryContract>,
        masterChefJettonWallet: SandboxContract<JettonWalletUSDT>,
        usdt: SandboxContract<JettonMasterUSDT>,
        userDepositAmount = 1n * TOKEN_DECIMALS,
    ) {
        await addPool(masterChef, masterChefJettonWallet);
        return await depositJetton(usdt, user, masterChef, userDepositAmount);
    }

    // User withdraws USDT from MasterChef
    async function withdraw(
        masterChef: SandboxContract<JettonMasterChef>,
        user: SandboxContract<TreasuryContract>,
        masterChefJettonWallet: SandboxContract<JettonWalletUSDT>,
        userWithdrawAmount = 5n * 10n ** 5n,
    ) {
        return await masterChef.send(
            user.getSender(),
            { value: toNano('1') },
            {
                $$type: 'Withdraw',
                queryId: 0n,
                lpTokenAddress: masterChefJettonWallet.address,
                amount: userWithdrawAmount,
                beneficiary: user.address,
            },
        );
    }

    // User harvests reward from MasterChef
    async function harvest(
        masterChef: SandboxContract<JettonMasterChef>,
        user: SandboxContract<TreasuryContract>,
        masterChefJettonWallet: SandboxContract<JettonWalletUSDT>,
    ) {
        return await masterChef.send(
            user.getSender(),
            { value: toNano('1') },
            {
                $$type: 'Harvest',
                queryId: 0n,
                lpTokenAddress: masterChefJettonWallet.address,
                beneficiary: user.address,
            },
        );
    }

    async function setupRevertEnv(startTime: bigint = -10n) {
        // Init the blockchain
        blockchain = await Blockchain.create();
        blockchain.now = Math.floor(Date.now() / 1000);

        // Characters
        deployer = await blockchain.treasury('deployer'); // Owner of MasterChef
        ThunderFi = await blockchain.treasury('ThunderFi'); // Owner of MasterChef
        user = await blockchain.treasury('user'); // User who deposits, withdraws, and harvests

        // Contracts
        kitchen = await blockchain.openContract(await Kitchen.fromInit(ThunderFi.address, 0n)); // MasterChef Factory
        usdt = blockchain.openContract(await JettonMasterUSDT.fromInit(deployer.address, beginCell().endCell())); // Reward token and LP token
        seed = BigInt(`0x${beginCell().storeUint(Date.now(), 64).endCell().hash().toString('hex')}`); // Seed for MasterChef

        deployerJettonWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(deployer.address, usdt.address)); // Deployer USDT JettonWallet
        thunderFiJettonWallet = blockchain.openContract(
            await JettonWalletUSDT.fromInit(ThunderFi.address, usdt.address),
        );
        // Setup all the contracts
        await usdt.send(deployer.getSender(), { value: toNano('1') }, 'Mint:1'); // Mint USDT to deployer so that he can start the MasterChef
        await usdt.send(ThunderFi.getSender(), { value: toNano('1') }, 'Mint:1'); // Mint USDT to deployer so that he can start the MasterChef

        const kitcherResult = await kitchen.send(
            ThunderFi.getSender(),
            {
                value: toNano('0.5'),
            },
            {
                $$type: 'Deploy',
                queryId: 0n,
            },
        );

        expect(kitcherResult.transactions).toHaveTransaction({
            from: ThunderFi.address,
            to: kitchen.address,
            deploy: true,
            success: true,
        });
        let masterChefAddress = await kitchen.getGetJettonMasterChefAddress(deployer.address, seed); // MasterChef address
        masterChef = blockchain.openContract(await JettonMasterChef.fromAddress(masterChefAddress)); // MasterChef
        masterChefJettonWalletAddress = await usdt.getGetWalletAddress(masterChefAddress); // MasterChef USDT JettonWallet address
        masterChefJettonWallet = blockchain.openContract(
            await JettonWalletUSDT.fromAddress(masterChefJettonWalletAddress),
        ); // MasterChef USDT JettonWallet
        masterChefJettonWallet = blockchain.openContract(
            await JettonWalletUSDT.fromInit(masterChef.address, usdt.address),
        ); // MasterChef USDT JettonWallet

        deadline = BigInt(blockchain.now!! + 2000);
        totalReward = 1000n * 10n ** 5n;
        // Build the MasterChef contract from kitchen
        const masterChefResult = await kitchen.send(
            deployer.getSender(),
            {
                value: toNano('0.5'),
            },
            {
                $$type: 'BuildJettonMasterChef',
                owner: deployer.address,
                seed: seed,
                thunderMintJettonWallet: deployerJettonWallet.address,
                mcRewardJettonWallet: masterChefJettonWallet.address,
                metaData: beginCell().storeStringTail('httpppp').endCell(),
                deadline: deadline,
                totalReward: totalReward,
                startTime: BigInt(blockchain.now!!) + startTime,
            },
        );
        expect(masterChefResult.transactions).toHaveTransaction({
            from: kitchen.address,
            to: masterChef.address,
            success: true,
        });

        return { deployer, user, kitchen, usdt, seed, deployerJettonWallet };
    }

    beforeEach(async () => {
        // Init the blockchain
        blockchain = await Blockchain.create();
        blockchain.now = Math.floor(Date.now() / 1000);

        // Characters
        ThunderFi = await blockchain.treasury('ThunderFi'); // Owner of MasterChef
        deployer = await blockchain.treasury('deployer'); // Owner of MasterChef
        user = await blockchain.treasury('user'); // User who deposits, withdraws, and harvests

        // Contracts
        kitchen = await blockchain.openContract(await Kitchen.fromInit(ThunderFi.address, 0n)); // MasterChef Factory
        usdt = blockchain.openContract(await JettonMasterUSDT.fromInit(deployer.address, beginCell().endCell())); // Reward token and LP token
        seed = BigInt(`0x${beginCell().storeUint(Date.now(), 64).endCell().hash().toString('hex')}`); // Seed for MasterChef

        deployerJettonWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(deployer.address, usdt.address)); // Deployer USDT JettonWallet
        thunderFiJettonWallet = blockchain.openContract(
            await JettonWalletUSDT.fromInit(ThunderFi.address, usdt.address),
        );

        // Setup all the contracts
        await usdt.send(deployer.getSender(), { value: toNano('1') }, 'Mint:1'); // Mint USDT to deployer so that he can start the MasterChef
        await usdt.send(ThunderFi.getSender(), { value: toNano('1') }, 'Mint:1'); // Mint USDT to deployer so that he can start the MasterChef

        const kitcherResult = await kitchen.send(
            ThunderFi.getSender(),
            {
                value: toNano('0.5'),
            },
            {
                $$type: 'Deploy',
                queryId: 0n,
            },
        );

        expect(kitcherResult.transactions).toHaveTransaction({
            from: ThunderFi.address,
            to: kitchen.address,
            deploy: true,
            success: true,
        });
        let masterChefAddress = await kitchen.getGetJettonMasterChefAddress(deployer.address, seed); // MasterChef address
        masterChef = blockchain.openContract(await JettonMasterChef.fromAddress(masterChefAddress)); // MasterChef
        masterChefJettonWalletAddress = await usdt.getGetWalletAddress(masterChefAddress); // MasterChef USDT JettonWallet address
        masterChefJettonWallet = blockchain.openContract(
            await JettonWalletUSDT.fromAddress(masterChefJettonWalletAddress),
        ); // MasterChef USDT JettonWallet
        masterChefJettonWallet = blockchain.openContract(
            await JettonWalletUSDT.fromInit(masterChef.address, usdt.address),
        ); // MasterChef USDT JettonWallet

        deadline = BigInt(blockchain.now!! + 2000);
        totalReward = 1000n * 10n ** 5n;
        // Build the MasterChef contract from kitchen
        const masterChefResult = await kitchen.send(
            deployer.getSender(),
            {
                value: toNano('0.5'),
            },
            {
                $$type: 'BuildJettonMasterChef',
                owner: deployer.address,
                seed: seed,
                thunderMintJettonWallet: deployerJettonWallet.address,
                mcRewardJettonWallet: masterChefJettonWallet.address,
                metaData: beginCell().storeStringTail('httpppp').endCell(),
                deadline: deadline,
                totalReward: totalReward,
                startTime: BigInt(blockchain.now!!) - 10n, // -10n is to make sure that the MasterChef is started,
            },
        );
        expect(masterChefResult.transactions).toHaveTransaction({
            from: kitchen.address,
            to: masterChef.address,
            success: true,
        });

        const isInitialized = await initialize(masterChef, deployerJettonWallet, deployer);
        expect(isInitialized).toBe(true);
    });

    it('Should owner add pool into MasterChef', async () => {
        const allocPoint = 100n;
        const addPoolResult = await addPool(masterChef, masterChefJettonWallet, allocPoint);
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

    it('Should not add pool with alloc point 0', async () => {
        const allocPoint = 0n;
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
            success: false,
            exitCode: 36629,
        });
    });

    it('Should user deposit usdt to master chef and update pool', async () => {
        await addPool(masterChef, masterChefJettonWallet);
        const userDepositAmount = 1n * TOKEN_DECIMALS;
        const periodTime = 10;
        const depositResult = await deposit(masterChef, user, masterChefJettonWallet, usdt, userDepositAmount);
        // send the deposit to MasterChef
        expect(depositResult.transactions).toHaveTransaction({
            from: masterChefJettonWallet.address,
            to: masterChef.address,
            success: true,
        });

        let miniChefAddress = await masterChef.getGetMiniChefAddress(user.address);
        // check if masterchef send userDeposit to minichef
        expect(depositResult.transactions).toHaveTransaction({
            from: masterChef.address,
            to: miniChefAddress,
            success: true,
        });
        let miniChef = blockchain.openContract(await MiniChef.fromAddress(miniChefAddress));
        const userInfo = await miniChef.getGetUserInfo(masterChefJettonWallet.address);
        // check the user deposit amount is correct
        expect(userInfo.amount).toBe(userDepositAmount);
        // check the reqardDeft is zero
        expect(userInfo.rewardDebt).toBe(0n);

        const poolDataBefore: PoolInfo = await masterChef.getGetPoolInfo(masterChefJettonWallet.address);
        blockchain.now!! += periodTime;
        // user send update Pool to masterchef
        const updatePoolResult = await masterChef.send(
            user.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'UpdatePool',
                lpTokenAddress: masterChefJettonWallet.address,
            },
        );
        // check user send update Pool to masterchef is updated
        expect(updatePoolResult.transactions).toHaveTransaction({
            from: user.address,
            to: masterChef.address,
            success: true,
        });
        const poolDataAfter: PoolInfo = await masterChef.getGetPoolInfo(masterChefJettonWallet.address);
        // check the accRewardPerShare is updated
        expect(poolDataAfter.accRewardPerShare).toEqual(
            poolDataBefore.accRewardPerShare + (BigInt(periodTime) * rewardPerSecond * ACC_PRECISION) / TOKEN_DECIMALS,
        );
    });

    it('Should deposit and harvest', async () => {
        await addPool(masterChef, masterChefJettonWallet);
        const userDepositAmount = 1n * TOKEN_DECIMALS;
        const periodTime = 1000;
        const userBeforeTonBalance = await user.getBalance();
        await depositJetton(usdt, user, masterChef, userDepositAmount);
        const userAfterTonBalance = await user.getBalance();
        clearFile(gasFile);
        const UserDepositCostTon = Number(userBeforeTonBalance - userAfterTonBalance) / 10 ** 10;
        // console.log("Jetton MasterChef Cost:")
        // console.log('UserDepositCost', UserDepositCostTon, 'TON');
        appendToFile(gasFile, `Deposit Cost: ${UserDepositCostTon} TON`);

        // Update time to periodTime, so that we can harvest
        blockchain.now!! += periodTime;
        const userJettonWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(user.address, usdt.address));
        const userUSDTBalanceBefore = (await userJettonWallet.getGetWalletData()).balance;

        // User send Harvest to MasterChef
        const harvestResult = await harvest(masterChef, user, masterChefJettonWallet);
        const userAfterTonBalance2 = await user.getBalance();
        const UserHarvestCostTon = Number(userAfterTonBalance - userAfterTonBalance2) / 10 ** 10;
        //console.log('UserHarvestCost', UserHarvestCostTon, 'TON');
        appendToFile(gasFile, `Harvest Cost: ${UserHarvestCostTon} TON`);

        // Check if the user send Harvest to MasterChef
        expect(harvestResult.transactions).toHaveTransaction({
            from: user.address,
            to: masterChef.address,
            success: true,
        });

        // Check if the MasterChef send HarvestInternal to MiniChef
        let miniChefAddress = await masterChef.getGetMiniChefAddress(user.address);
        expect(harvestResult.transactions).toHaveTransaction({
            from: masterChef.address,
            to: miniChefAddress,
            success: true,
        });

        // Check if MiniChef send HarvestInternalReply to user
        expect(harvestResult.transactions).toHaveTransaction({
            from: miniChefAddress,
            to: masterChef.address,
            success: true,
        });

        // Check that MasterChef send JettonTransfer to user
        expect(harvestResult.transactions).toHaveTransaction({
            from: masterChef.address,
            to: masterChefJettonWallet.address,
            success: true,
        });

        // Check that MasterChef JettonWallet send JettonTransfer to user
        expect(harvestResult.transactions).toHaveTransaction({
            from: masterChefJettonWallet.address,
            to: userJettonWallet.address,
            success: true,
        });

        // User JettonWallet should have received the reward
        const userUSDTBalanceAfter = (await userJettonWallet.getGetWalletData()).balance;
        const benefit = (userDepositAmount * BigInt(periodTime) * rewardPerSecond) / TOKEN_DECIMALS;
        expect(userUSDTBalanceAfter).toEqual(userUSDTBalanceBefore + benefit);
    });

    it('Should deposit and harvest twice', async () => {
        await addPool(masterChef, masterChefJettonWallet);
        const userDepositAmount = 1n * TOKEN_DECIMALS;
        const periodTime = 1000;
        await depositJetton(usdt, user, masterChef, userDepositAmount);
        // Update time to periodTime, so that we can harvest
        blockchain.now!! += periodTime;
        const userJettonWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(user.address, usdt.address));
        const userUSDTBalanceBefore = (await userJettonWallet.getGetWalletData()).balance;
        // User send Harvest to MasterChef
        await harvest(masterChef, user, masterChefJettonWallet);

        // User JettonWallet should have received the reward
        const userUSDTBalanceAfter = (await userJettonWallet.getGetWalletData()).balance;
        const benefit = (userDepositAmount * BigInt(periodTime) * rewardPerSecond) / TOKEN_DECIMALS;
        expect(userUSDTBalanceAfter).toEqual(userUSDTBalanceBefore + benefit);

        // User Deposit Again
        await userJettonWallet.send(
            user.getSender(),
            { value: toNano('1.1') },
            {
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: userDepositAmount,
                destination: masterChef.address,
                response_destination: user.address,
                custom_payload: null,
                forward_ton_amount: toNano('1'),
                forward_payload: beginCell().endCell(),
            },
        );
        // Update time to periodTime, so that we can harvest
        blockchain.now!! += periodTime;

        // User send Harvest to MasterChef
        await harvest(masterChef, user, masterChefJettonWallet);

        // User JettonWallet should have received the reward
        // It shoud add deposit amount to the previous balance, so that we can calculate the benefit from the second harvest
        const userUSDTBalanceAfter2rdHarvest = (await userJettonWallet.getGetWalletData()).balance + userDepositAmount;
        // check the benefit of user1 and user2 are correct
        const benefit1 = BigInt(periodTime) * rewardPerSecond;
        expect(userUSDTBalanceAfter2rdHarvest).toEqual(userUSDTBalanceAfter + benefit1);
    });

    it('Should onwer Reallocate pool point', async () => {
        await addPool(masterChef, masterChefJettonWallet, 100n);
        const userDepositAmount = 1n * TOKEN_DECIMALS;
        const periodTime = 1000;
        await depositJetton(usdt, user, masterChef, userDepositAmount);

        // Update time to periodTime, so that we can harvest
        blockchain.now!! += periodTime;
        const userJettonWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(user.address, usdt.address));
        const userUSDTBalanceBefore = (await userJettonWallet.getGetWalletData()).balance;

        // User send Harvest to MasterChef
        await harvest(masterChef, user, masterChefJettonWallet);

        // User JettonWallet should have received the reward
        const userUSDTBalanceAfter = (await userJettonWallet.getGetWalletData()).balance;
        const benefit = (userDepositAmount * BigInt(periodTime) * rewardPerSecond) / TOKEN_DECIMALS;
        expect(userUSDTBalanceAfter).toEqual(userUSDTBalanceBefore + benefit);

        // Owner reallocate the pool point
        const reallocateResult = await masterChef.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'Set',
                lpTokenAddress: masterChefJettonWallet.address,
                allocPoint: 200n,
            },
        );

        // Check that owner send Set msg to MasterChef
        expect(reallocateResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: masterChef.address,
            success: true,
        });

        // After reallocate the pool point, the allocPoint should be 200
        const poolData: PoolInfo = await masterChef.getGetPoolInfo(masterChefJettonWallet.address);
        expect(poolData.allocPoint).toBe(200n);

        // User can still harvest the reward

        // Update time to periodTime, so that we can harvest
        blockchain.now!! += periodTime;
        const userUSDTBalanceBefore2 = (await userJettonWallet.getGetWalletData()).balance;

        // User send Harvest to MasterChef
        await harvest(masterChef, user, masterChefJettonWallet);

        // User JettonWallet should have received the reward
        const userUSDTBalanceAfter2 = (await userJettonWallet.getGetWalletData()).balance;
        const benefit2 = (userDepositAmount * BigInt(periodTime) * rewardPerSecond) / TOKEN_DECIMALS;
        expect(userUSDTBalanceAfter2).toEqual(userUSDTBalanceBefore2 + benefit2);
    });

    it('Should only owner can reallocate pool points', async () => {
        await addPool(masterChef, masterChefJettonWallet, 100n);

        // Owner reallocate the pool point
        const reallocateResult = await masterChef.send(
            user.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'Set',
                lpTokenAddress: masterChefJettonWallet.address,
                allocPoint: 200n,
            },
        );
        expect(reallocateResult.transactions).toHaveTransaction({
            from: user.address,
            to: masterChef.address,
            success: false,
            exitCode: 36210,
        });
    });

    it('Should onwer Reallocate pool point within two pools', async () => {
        // Add USDT Pool
        await addPool(masterChef, masterChefJettonWallet, 100n);

        // Create USDC Jetton Master
        usdc = blockchain.openContract(await JettonMasterUSDT.fromInit(user.address, beginCell().endCell()));
        // Mint USDC
        await usdc.send(user.getSender(), { value: toNano('1') }, 'Mint:1');
        await usdc.send(deployer.getSender(), { value: toNano('1') }, 'Mint:1');

        // Get MasterChef USDC JettonWallet
        const masterChefUSDCJettonWalletAddress = await usdc.getGetWalletAddress(masterChef.address);
        const masterChefUSDCJettonWallet = blockchain.openContract(
            await JettonWalletUSDT.fromAddress(masterChefUSDCJettonWalletAddress),
        ); // MasterChef USDT JettonWallet

        // Add USDC Pool
        const addUSDCPoolResult = await addPool(masterChef, masterChefUSDCJettonWallet, 100n);
        expect(addUSDCPoolResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: masterChef.address,
            success: true,
        });

        const userDepositAmount = 1n * TOKEN_DECIMALS;
        const periodTime = 1000;

        // Deposit USDT
        await depositJetton(usdt, user, masterChef, userDepositAmount);
        // Deposit USDC
        await depositJetton(usdc, user, masterChef, userDepositAmount);

        // Update time to periodTime, so that we can harvest
        blockchain.now!! += periodTime;
        const userJettonWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(user.address, usdt.address));
        const userUSDTBalanceBefore = (await userJettonWallet.getGetWalletData()).balance;

        // User send Harvest to MasterChef
        await harvest(masterChef, user, masterChefJettonWallet);

        // User JettonWallet should have received the reward
        const userUSDTBalanceAfter = (await userJettonWallet.getGetWalletData()).balance;

        // Benefit should divide by 2 because there are two pools and the allocPoint is the same
        const benefit = (userDepositAmount * BigInt(periodTime) * rewardPerSecond) / TOKEN_DECIMALS / 2n;
        expect(userUSDTBalanceAfter).toEqual(userUSDTBalanceBefore + benefit);

        // Owner reallocate the pool point
        const reallocateResult = await masterChef.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'Set',
                lpTokenAddress: masterChefJettonWallet.address,
                allocPoint: 200n,
            },
        );

        // Check that owner send Set msg to MasterChef
        expect(reallocateResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: masterChef.address,
            success: true,
        });

        // After reallocate the pool point, the allocPoint should be 200
        const poolData: PoolInfo = await masterChef.getGetPoolInfo(masterChefJettonWallet.address);
        expect(poolData.allocPoint).toBe(200n);

        // User can still harvest the reward

        // Update time to periodTime, so that we can harvest
        blockchain.now!! += periodTime;
        const userUSDTBalanceBefore2 = (await userJettonWallet.getGetWalletData()).balance;

        // User send Harvest to MasterChef
        await harvest(masterChef, user, masterChefJettonWallet);

        // User JettonWallet should have received the reward
        const userUSDTBalanceAfter2 = (await userJettonWallet.getGetWalletData()).balance;
        // benefit should be x 2/3 because USDT Pool's allocPoint is 200 and total allocPoint is 300
        const benefit2 = (2n * (userDepositAmount * BigInt(periodTime) * rewardPerSecond)) / TOKEN_DECIMALS / 3n;
        expect(userUSDTBalanceAfter2).toEqual(userUSDTBalanceBefore2 + benefit2);
    });

    it('Should user deposit in two pools and harvest get the all reward', async () => {
        // Add USDT Pool
        await addPool(masterChef, masterChefJettonWallet, 100n);

        // Create USDC Jetton Master
        usdc = blockchain.openContract(await JettonMasterUSDT.fromInit(user.address, beginCell().endCell()));
        // Mint USDC
        await usdc.send(user.getSender(), { value: toNano('1') }, 'Mint:1');
        await usdc.send(deployer.getSender(), { value: toNano('1') }, 'Mint:1');

        // Get MasterChef USDC JettonWallet
        const masterChefUSDCJettonWalletAddress = await usdc.getGetWalletAddress(masterChef.address);
        const masterChefUSDCJettonWallet = blockchain.openContract(
            await JettonWalletUSDT.fromAddress(masterChefUSDCJettonWalletAddress),
        ); // MasterChef USDT JettonWallet

        // Add USDC Pool
        const addUSDCPoolResult = await addPool(masterChef, masterChefUSDCJettonWallet, 100n);
        expect(addUSDCPoolResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: masterChef.address,
            success: true,
        });

        const userDepositAmount = 1n * TOKEN_DECIMALS;
        const periodTime = 1000;

        // Deposit USDT
        await depositJetton(usdt, user, masterChef, userDepositAmount);
        // Deposit USDC
        await depositJetton(usdc, user, masterChef, userDepositAmount);

        // Update time to periodTime, so that we can harvest
        blockchain.now!! += periodTime;
        const userJettonWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(user.address, usdt.address));
        const userUSDTBalanceBefore = (await userJettonWallet.getGetWalletData()).balance;

        const usderUSDCJettonWallet = blockchain.openContract(
            await JettonWalletUSDT.fromInit(user.address, usdc.address),
        );

        // User send Harvest to MasterChef
        await harvest(masterChef, user, masterChefJettonWallet);
        await harvest(masterChef, user, masterChefUSDCJettonWallet);

        // User JettonWallet should have received the reward
        const userUSDTBalanceAfter = (await userJettonWallet.getGetWalletData()).balance;

        // Benefit should divide by 2 because there are two pools and the allocPoint is the same
        const benefit = (2n * (userDepositAmount * BigInt(periodTime) * rewardPerSecond)) / TOKEN_DECIMALS / 2n;
        expect(userUSDTBalanceAfter).toEqual(userUSDTBalanceBefore + benefit);

        // Owner reallocate the pool point
        const reallocateResult = await masterChef.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'Set',
                lpTokenAddress: masterChefJettonWallet.address,
                allocPoint: 200n,
            },
        );

        // Check that owner send Set msg to MasterChef
        expect(reallocateResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: masterChef.address,
            success: true,
        });

        // After reallocate the pool point, the allocPoint should be 200
        const poolData: PoolInfo = await masterChef.getGetPoolInfo(masterChefJettonWallet.address);
        expect(poolData.allocPoint).toBe(200n);

        // User can still harvest the reward

        // Update time to periodTime, so that we can harvest
        blockchain.now!! += periodTime;
        const userUSDTBalanceBefore2 = (await userJettonWallet.getGetWalletData()).balance;

        // User send Harvest to MasterChef
        await harvest(masterChef, user, masterChefJettonWallet);

        // User JettonWallet should have received the reward
        const userUSDTBalanceAfter2 = (await userJettonWallet.getGetWalletData()).balance;
        // benefit should be x 2/3 because USDT Pool's allocPoint is 200 and total allocPoint is 300
        const benefit2 = (2n * (userDepositAmount * BigInt(periodTime) * rewardPerSecond)) / TOKEN_DECIMALS / 3n;
        expect(userUSDTBalanceAfter2).toEqual(userUSDTBalanceBefore2 + benefit2);
    });

    it('Should Harvest After Deadline', async () => {
        await addPool(masterChef, masterChefJettonWallet);
        const userDepositAmount = 1n * TOKEN_DECIMALS;
        const periodTime = 1000;
        await depositJetton(usdt, user, masterChef, userDepositAmount);
        // Update time to periodTime, so that we can harvest
        blockchain.now!! += periodTime;
        const userJettonWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(user.address, usdt.address));
        const userUSDTBalanceBefore = (await userJettonWallet.getGetWalletData()).balance;
        // User send Harvest to MasterChef
        await harvest(masterChef, user, masterChefJettonWallet);

        // User JettonWallet should have received the reward
        const userUSDTBalanceAfter = (await userJettonWallet.getGetWalletData()).balance;
        const benefit = (userDepositAmount * BigInt(periodTime) * rewardPerSecond) / TOKEN_DECIMALS;
        expect(userUSDTBalanceAfter).toEqual(userUSDTBalanceBefore + benefit);

        // User Deposit Again
        await userJettonWallet.send(
            user.getSender(),
            { value: toNano('1.1') },
            {
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: userDepositAmount,
                destination: masterChef.address,
                response_destination: user.address,
                custom_payload: null,
                forward_ton_amount: toNano('1'),
                forward_payload: beginCell().endCell(),
            },
        );
        // Update time to periodTime, so that we can harvest
        blockchain.now!! += periodTime * 3;

        // User send Harvest to MasterChef
        await harvest(masterChef, user, masterChefJettonWallet);

        // User JettonWallet should have received the reward
        // It shoud add deposit amount to the previous balance, so that we can calculate the benefit from the second harvest
        const userUSDTBalanceAfter2rdHarvest = (await userJettonWallet.getGetWalletData()).balance + userDepositAmount;
        // check the benefit of user1 and user2 are correct
        // Only get the benefit until the deadline
        const benefit1 = BigInt(periodTime) * rewardPerSecond;
        expect(userUSDTBalanceAfter2rdHarvest).toEqual(userUSDTBalanceAfter + benefit1);
    });

    it('Should deposit and withdraw', async () => {
        const userDepositAmount = 1n * TOKEN_DECIMALS;
        const userWithdrawAmount = 5n * 10n ** 5n;
        const periodTime = 10;
        const userJettonWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(user.address, usdt.address));
        // deposit first
        await deposit(masterChef, user, masterChefJettonWallet, usdt, userDepositAmount);
        // get the balance of usdt before withdraw
        const userUSDTBalanceBefore = (await userJettonWallet.getGetWalletData()).balance;

        // withdraw
        blockchain.now!! += periodTime;
        const withdrawResult = await withdraw(masterChef, user, masterChefJettonWallet, userWithdrawAmount);
        // check the depositAndWithdrawResult is sucess
        expect(withdrawResult.transactions).toHaveTransaction({
            from: user.address,
            to: masterChef.address,
            success: true,
            op: 0x097bb407,
        });

        const userUSDTBalanceAfter = (await userJettonWallet.getGetWalletData()).balance;

        // check the differnce between userUSDTBalanceBefore and userUSDTBalanceAfter is equal to userWithdrawAmount
        expect(userUSDTBalanceAfter).toEqual(userUSDTBalanceBefore + userWithdrawAmount);
    });

    it('Should deposit and withdarw with harvest', async () => {
        const userDepositAmount = 1n * TOKEN_DECIMALS;
        const userWithdrawAmount = 5n * 10n ** 5n;
        const periodTime = 10;
        const userJettonWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(user.address, usdt.address));
        // deposit first
        await deposit(masterChef, user, masterChefJettonWallet, usdt, userDepositAmount);
        // get the balance of usdt before withdraw
        const userUSDTBalanceBeforeWithdraw = (await userJettonWallet.getGetWalletData()).balance;

        // Update time to periodTime, so that we can withdraw
        blockchain.now!! += periodTime;
        const userWithdrawCostTon = await user.getBalance();
        // withdraw
        await withdraw(masterChef, user, masterChefJettonWallet, userWithdrawAmount);
        const userAfterWithdrawCostTon = await user.getBalance();
        const userWithdrawCost = Number(userWithdrawCostTon - userAfterWithdrawCostTon) / 10 ** 10;
        // console.log('UserWithdrawCost', userWithdrawCost, 'TON');
        appendToFile(gasFile, `Withdraw Cost: ${userWithdrawCost} TON`);
        // console.log("-----------------")
        const userUSDTBalanceBeforeHarvest = (await userJettonWallet.getGetWalletData()).balance;

        // Update time to periodTime, so that we can harvest
        blockchain.now!! += periodTime;
        // User send Harvest to MasterChef
        await harvest(masterChef, user, masterChefJettonWallet);
        const userUSDTBalanceAfterHarvest = (await userJettonWallet.getGetWalletData()).balance;

        // check the differnce between userUSDTBalanceBeforeWithdraw and userUSDTBalanceAfterHarvest is equal to userWithdrawAmount
        expect(userUSDTBalanceBeforeHarvest).toEqual(userUSDTBalanceBeforeWithdraw + userWithdrawAmount);
        // check the differnce between userUSDTBalanceBeforeWithdraw and userUSDTBalanceAfterHarvest is equal to userWithdrawAmount
        const remainDeposit = userDepositAmount - userWithdrawAmount;
        const benefit = ((userDepositAmount + remainDeposit) * BigInt(periodTime) * rewardPerSecond) / TOKEN_DECIMALS;
        expect(userUSDTBalanceAfterHarvest).toEqual(userUSDTBalanceBeforeHarvest + benefit);
    });

    it('Should withdraw and harvest in one step', async () => {
        const userDepositAmount = 1n * TOKEN_DECIMALS;
        const userWithdrawAmount = 5n * 10n ** 5n;
        const periodTime = 1000;
        const userJettonWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(user.address, usdt.address));
        // deposit first
        await deposit(masterChef, user, masterChefJettonWallet, usdt, userDepositAmount);
        // get the balance of usdt before withdraw
        const userUSDTBalanceBeforeWH = (await userJettonWallet.getGetWalletData()).balance;

        // Update time to periodTime, so that we can withdraw
        blockchain.now!! += periodTime;
        const userTonBalBefore = await user.getBalance();
        const WithdrawAndHarvestResult = await masterChef.send(
            user.getSender(),
            { value: toNano('2') },
            {
                $$type: 'WithdrawAndHarvest',
                queryId: 0n,
                lpTokenAddress: masterChefJettonWallet.address,
                withdrawAmount: userWithdrawAmount,
                beneficiary: user.address,
            },
        );
        const userTonBalAfter = await user.getBalance();
        const userWHCost = Number(userTonBalBefore - userTonBalAfter) / 10 ** 10;
        //console.log('UserWithdraw & Harvest Cost', userWHCost, 'TON');
        appendToFile(gasFile, `Withdraw & Harvest Cost: ${userWHCost} TON`);
        // Check that user send WithdrawAndHarvest to MasterChef
        expect(WithdrawAndHarvestResult.transactions).toHaveTransaction({
            from: user.address,
            to: masterChef.address,
            success: true,
        });

        // Check that MasterChef send WithdrawInternal to MiniChef
        let miniChefAddress = await masterChef.getGetMiniChefAddress(user.address);
        expect(WithdrawAndHarvestResult.transactions).toHaveTransaction({
            from: masterChef.address,
            to: miniChefAddress,
            success: true,
        });

        // Check that MiniChef send WithdrawInternalReply to MasterChef
        expect(WithdrawAndHarvestResult.transactions).toHaveTransaction({
            from: miniChefAddress,
            to: masterChef.address,
            success: true,
        });

        // Check that MasterChef send JettonTransfer to his JettonWallet
        expect(WithdrawAndHarvestResult.transactions).toHaveTransaction({
            from: masterChef.address,
            to: masterChefJettonWallet.address,
            success: true,
        });

        // Check that MasterChef JettonWallet send JettonTransfer to user JettonWallet
        expect(WithdrawAndHarvestResult.transactions).toHaveTransaction({
            from: masterChefJettonWallet.address,
            to: userJettonWallet.address,
            success: true,
        });

        // Make sure that user has received the reward and the withdraw amount
        const userUSDTBalanceAfterWH = (await userJettonWallet.getGetWalletData()).balance;
        const benefit = (userDepositAmount * BigInt(periodTime) * rewardPerSecond) / TOKEN_DECIMALS;
        expect(userUSDTBalanceAfterWH).toEqual(userUSDTBalanceBeforeWH + benefit + userWithdrawAmount);
    });

    it('Should not withdraw internal reply by user', async () => {
        const userDepositAmount = 1n * TOKEN_DECIMALS;
        const userWithdrawAmount = 5n * 10n ** 5n;
        // deposit first
        await deposit(masterChef, user, masterChefJettonWallet, usdt, userDepositAmount);

        const withdrawInternalReplyResult = await masterChef.send(
            user.getSender(),
            { value: toNano('1') },
            {
                $$type: 'WithdrawInternalReply',
                queryId: 0n,
                lpTokenAddress: masterChefJettonWallet.address,
                amount: userWithdrawAmount,
                sender: user.address,
                beneficiary: user.address,
            },
        );
        // check the withdrawInternalReplyResult is not sucess
        expect(withdrawInternalReplyResult.transactions).toHaveTransaction({
            from: user.address,
            to: masterChef.address,
            success: false,
            op: 0xdc4c8b1a,
            exitCode: 33311, //unexpected sender
        });
    });

    it('Should not harvest internal reply by user', async () => {
        // deposit first
        await deposit(masterChef, user, masterChefJettonWallet, usdt);

        const harvestInternalReplyResult = await masterChef.send(
            user.getSender(),
            { value: toNano('1') },
            {
                $$type: 'HarvestInternalReply',
                queryId: 0n,
                lpTokenAddress: masterChefJettonWallet.address,
                beneficiary: user.address,
                reward: 100000n,
                sender: user.address,
            },
        );

        // check the harvestInternalReplyResult is not sucess
        expect(harvestInternalReplyResult.transactions).toHaveTransaction({
            from: user.address,
            to: masterChef.address,
            success: false,
            op: 0x952bcd19,
            exitCode: 33311, //unexpected sender
        });
    });

    it('Should harvest by different user', async () => {
        const user1 = await blockchain.treasury('user1');
        const user2 = await blockchain.treasury('user2');
        const user1DepositAmount = 1n * TOKEN_DECIMALS;
        const user2DepositAmount = 2n * TOKEN_DECIMALS;
        const periodTime = 30;
        // addpool
        await addPool(masterChef, masterChefJettonWallet);
        // user1 deposit
        await depositJetton(usdt, user1, masterChef, user1DepositAmount);
        const user1JettonWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(user1.address, usdt.address));
        const user1USDTBalanceBefore = (await user1JettonWallet.getGetWalletData()).balance;
        // user2 deposit
        await depositJetton(usdt, user2, masterChef, user2DepositAmount);
        const user2JettonWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(user2.address, usdt.address));
        const user2USDTBalanceBefore = (await user2JettonWallet.getGetWalletData()).balance;
        blockchain.now!! += periodTime;
        // user1 harvest
        await harvest(masterChef, user1, masterChefJettonWallet);
        const user1USDTBalanceAfter = (await user1JettonWallet.getGetWalletData()).balance;
        // user2 harvest
        await harvest(masterChef, user2, masterChefJettonWallet);
        const user2USDTBalanceAfter = (await user2JettonWallet.getGetWalletData()).balance;

        // check the benefit of user1 and user2 are correct
        const totalDeposit = user1DepositAmount + user2DepositAmount;
        const rewardPerShare = (TOKEN_DECIMALS * (BigInt(periodTime) * rewardPerSecond)) / totalDeposit;
        const benefit1 = (user1DepositAmount * rewardPerShare) / TOKEN_DECIMALS;
        const benefit2 = (user2DepositAmount * rewardPerShare) / TOKEN_DECIMALS;

        expect(user1USDTBalanceAfter).toEqual(user1USDTBalanceBefore + benefit1);
        expect(user2USDTBalanceAfter).toEqual(user2USDTBalanceBefore + benefit2);
    });

    it('Should not initialize if not enough reward', async () => {
        ({ deployer, user, kitchen, usdt, seed, deployerJettonWallet } = await setupRevertEnv());
        await deployerJettonWallet.send(
            deployer.getSender(),
            {
                value: toNano('1.5'),
            },
            {
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: totalReward,
                destination: masterChef.address,
                response_destination: deployer.address,
                custom_payload: null,
                forward_ton_amount: toNano('1'),
                forward_payload: beginCell().storeCoins(rewardPerSecond).storeUint(deadline, 64).endCell(),
            },
        );

        // check if the masterChef is not initialized
        const masterChefData = await masterChef.getGetJettonMasterChefData();
        const isInitialized = masterChefData.isInitialized;
        expect(isInitialized).toBe(false);
    });

    it('Should not deposit after deadline', async () => {
        await addPool(masterChef, masterChefJettonWallet);
        const userDepositAmount = 1n * TOKEN_DECIMALS;
        const periodTime = 3500; // deadline is 2000
        // Mint USDT to user so that he can deposit
        await usdt.send(user.getSender(), { value: toNano('1') }, 'Mint:1');
        const userJettonWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(user.address, usdt.address));

        // Update time to periodTime to make sure that the deadline is passed
        blockchain.now!! += periodTime;
        const userUSDTBefore = (await userJettonWallet.getGetWalletData()).balance;
        // deposit first
        let result = await userJettonWallet.send(
            user.getSender(),
            { value: toNano('1.1') },
            {
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: userDepositAmount,
                destination: masterChef.address,
                response_destination: user.address,
                custom_payload: null,
                forward_ton_amount: toNano('1'),
                forward_payload: beginCell().endCell(),
            },
        );
        // get the balance of usdt After deposit
        const userUSDTAfter = (await userJettonWallet.getGetWalletData()).balance;
        // Master Chef should not accept the deposit and also return the deposit
        expect(userUSDTAfter).toEqual(userUSDTBefore);
    });

    it('Should deposit and harvest but deadline passed in the midle', async () => {
        const userDepositAmount = 1n * TOKEN_DECIMALS;
        const periodTime = 2500;
        const userJettonWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(user.address, usdt.address));
        // deposit first
        await deposit(masterChef, user, masterChefJettonWallet, usdt, userDepositAmount);
        // get the balance of usdt before withdraw
        const userUSDTBalanceBeforeHarvest = (await userJettonWallet.getGetWalletData()).balance;

        const startBlock = BigInt(blockchain.now!!);
        // Update time to periodTime, so that we can harvest
        blockchain.now!! += periodTime;
        // User send Harvest to MasterChef
        await harvest(masterChef, user, masterChefJettonWallet);
        const userUSDTBalanceAfterHarvest = (await userJettonWallet.getGetWalletData()).balance;
        // It can only get the benefit until the deadline
        const benefit = (userDepositAmount * BigInt(deadline - startBlock) * rewardPerSecond) / TOKEN_DECIMALS;
        expect(userUSDTBalanceAfterHarvest).toEqual(userUSDTBalanceBeforeHarvest + benefit);
    });

    it('Should reject initialization if the contract has already been initialized', async () => {
        const result = await masterChef.send(
            user.getSender(),
            { value: toNano('1') },
            {
                $$type: 'SetUpJettonMC',
                owner: user.address,
                mcRewardJettonWallet: masterChefJettonWallet.address,
                thunderMintWallet: deployer.address,
                thunderMintJettonWallet: deployerJettonWallet.address,
                metaData: beginCell().storeStringTail('httpppp').endCell(),
                totalReward: 1000n * 10n ** 5n,
                deadline: deadline,
                startTime: BigInt(blockchain.now!!) - 10n,
            },
        );

        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: masterChef.address,
            success: false,
            exitCode: 22034, // Already initialized
        });
    });
    it('Should reject if Send SetUpJettonMC before owner deposit rewaed', async () => {
        ({ deployer, user, kitchen, usdt, seed, deployerJettonWallet } = await setupRevertEnv());

        const result = await masterChef.send(
            user.getSender(),
            { value: toNano('1') },
            {
                $$type: 'SetUpJettonMC',
                owner: user.address,
                mcRewardJettonWallet: masterChefJettonWallet.address,
                thunderMintWallet: deployer.address,
                thunderMintJettonWallet: deployerJettonWallet.address,
                metaData: beginCell().storeStringTail('httpppp').endCell(),
                totalReward: 1000n * 10n ** 5n,
                deadline: deadline,
                startTime: BigInt(blockchain.now!!) - 10n,
            },
        );

        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: masterChef.address,
            success: false,
            exitCode: 6499, // Reward wallet already set
        });
    });

    it('Should reject jetton transfers from non-reward jetton wallets', async () => {
        ({ deployer, user, kitchen, usdt, seed, deployerJettonWallet } = await setupRevertEnv());
        const result = await masterChef.send(
            user.getSender(),
            { value: toNano('2') },
            {
                $$type: 'JettonTransferNotification',
                query_id: 0n,
                amount: 100000n,
                sender: user.address,
                forward_payload: beginCell().endCell(),
            },
        );

        // Should revert with ERROR_WRONG_AUTH
        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: masterChef.address,
            success: false,
            exitCode: 1004, // ERROR_WRONG_AUTH
        });
    });

    // Test contract initialization by a non-owner entity.
    it('Should only allow the contract owner to initiate the contract', async () => {
        ({ deployer, user, kitchen, usdt, seed, deployerJettonWallet } = await setupRevertEnv());
        const feeAmont = (totalReward * 3n) / 1000n;
        const extraAmount = 2000000n;

        await usdt.send(user.getSender(), { value: toNano('1') }, 'Mint:1');
        let userJettonWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(user.address, usdt.address)); // Deployer USDT JettonWallet

        const initResult = await userJettonWallet.send(
            user.getSender(),
            {
                value: toNano('1.5'),
            },
            {
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: totalReward + feeAmont + extraAmount,
                destination: masterChef.address,
                response_destination: user.address,
                custom_payload: null,
                forward_ton_amount: toNano('1'),
                forward_payload: beginCell().endCell(),
            },
        );

        // expect revert with ERROR_WRONG_AUTH
        expect(initResult.transactions).toHaveTransaction({
            from: masterChefJettonWallet.address,
            to: masterChef.address,
            success: false,
            exitCode: 1004, // ERROR_WRONG_AUTH
        });
    });

    // Test the behavior when the reward amount sent is insufficient.
    it('Should return the entire amount if the reward sent is not sufficient for initialization', async () => {
        // Send an insufficient reward amount and verify that it is returned in full.
        ({ deployer, user, kitchen, usdt, seed, deployerJettonWallet } = await setupRevertEnv());

        const ownerBalanceBefore = (await deployerJettonWallet.getGetWalletData()).balance;
        const feeAmont = (totalReward * 3n) / 1000n;
        const extraAmount = 2000000n;
        const initResult = await deployerJettonWallet.send(
            deployer.getSender(),
            {
                value: toNano('1.5'),
            },
            {
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: totalReward - feeAmont - extraAmount, // Make it insufficient
                destination: masterChef.address,
                response_destination: deployer.address,
                custom_payload: null,
                forward_ton_amount: toNano('1'),
                forward_payload: beginCell().endCell(),
            },
        );
        const ownerBalanceAfter = (await deployerJettonWallet.getGetWalletData()).balance;
        // expect that ownerBalanceBefore and ownerBalanceAfter are equal, which means the entire amount was returned.
        expect(ownerBalanceAfter).toEqual(ownerBalanceBefore);

        // Send the token back
        expect(initResult.transactions).toHaveTransaction({
            from: masterChefJettonWalletAddress,
            to: deployerJettonWallet.address,
            success: true,
        });
    });

    // Test user deposit behavior before a pool is added.
    it('Should reject user deposits before any pool is added', async () => {
        // Attempt to make a deposit before any pool has been added to the contract and expect failure.

        await usdt.send(user.getSender(), { value: toNano('1') }, 'Mint:1');
        const userJettonWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(user.address, usdt.address));
        const userUSDTbalanceBefore = (await userJettonWallet.getGetWalletData()).balance;
        const userDepositAmount = 1n * TOKEN_DECIMALS;
        const depositResult = await userJettonWallet.send(
            user.getSender(),
            { value: toNano('1.1') },
            {
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: userDepositAmount,
                destination: masterChef.address,
                response_destination: user.address,
                custom_payload: null,
                forward_ton_amount: toNano('1'),
                forward_payload: beginCell().endCell(),
            },
        );
        const userUSDTbalanceAfter = (await userJettonWallet.getGetWalletData()).balance;
        expect(depositResult.transactions).toHaveTransaction({
            from: masterChefJettonWalletAddress,
            to: masterChef.address,
        });

        // If the pool does not exist, the deposit should fail and MC should return the deposited amount.
        expect(userUSDTbalanceAfter).toEqual(userUSDTbalanceBefore);
    });

    // Test withdraw functionality when the contract is not initialized.
    it('Should not allow withdrawals when the contract is not initialized', async () => {
        // Attempt a withdrawal from an uninitialized contract and expect it to fail.
        ({ deployer, user, kitchen, usdt, seed, deployerJettonWallet } = await setupRevertEnv());
        const withdrawResult = await masterChef.send(
            user.getSender(),
            { value: toNano('1') },
            {
                $$type: 'Withdraw',
                queryId: 0n,
                lpTokenAddress: masterChefJettonWallet.address,
                amount: 100000n,
                beneficiary: user.address,
            },
        );
        expect(withdrawResult.transactions).toHaveTransaction({
            from: user.address,
            to: masterChef.address,
            success: false,
            exitCode: 24895, // contract not initialized
        });
    });

    // Test user withdrawal before a pool is added.
    it('Should reject withdrawal requests before any pool is added', async () => {
        // Attempt to withdraw before any pool has been added and expect the transaction to fail.
        const withdrawResult = await masterChef.send(
            user.getSender(),
            { value: toNano('1') },
            {
                $$type: 'Withdraw',
                queryId: 0n,
                lpTokenAddress: masterChefJettonWallet.address,
                amount: 100000n,
                beneficiary: user.address,
            },
        );
        expect(withdrawResult.transactions).toHaveTransaction({
            from: user.address,
            to: masterChef.address,
            success: false,
            exitCode: 58086, // pool not exists
        });
    });

    // Test unauthorized internal withdraw messages sent to MiniChef.
    it('Should reject WithdrawInternal messages from non-MasterChef contracts', async () => {
        // Simulate a WithdrawInternal message from an unauthorized source and expect rejection.
        const userDepositAmount = 1n * TOKEN_DECIMALS;
        // deposit first
        await deposit(masterChef, user, masterChefJettonWallet, usdt, userDepositAmount);
        const miniChefAddress = await masterChef.getGetMiniChefAddress(user.address);
        const miniChef = blockchain.openContract(await MiniChef.fromAddress(miniChefAddress));
        const withdrawInternalResult = await miniChef.send(
            user.getSender(),
            { value: toNano('1') },
            {
                $$type: 'WithdrawInternal',
                queryId: 0n,
                lpTokenAddress: masterChefJettonWallet.address,
                amount: 100000n,
                rewardDebt: 100n,
                beneficiary: user.address,
                sender: user.address,
            },
        );
        expect(withdrawInternalResult.transactions).toHaveTransaction({
            from: user.address,
            to: miniChefAddress,
            success: false,
            exitCode: 9504, // only masterChef can withdraw
        });
    });

    // Test user attempting to withdraw more than their balance.
    it('Should prevent users from withdrawing more than their current balance', async () => {
        // Attempt to withdraw an amount greater than the user's balance and expect failure.const userDepositAmount = 1n * TOKEN_DECIMALS;
        const userDepositAmount = 1n * TOKEN_DECIMALS;
        const userWithdrawAmount = 5n * userDepositAmount;
        const periodTime = 10;
        const userJettonWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(user.address, usdt.address));
        // deposit first
        await deposit(masterChef, user, masterChefJettonWallet, usdt, userDepositAmount);
        // get the balance of usdt before withdraw
        const userUSDTBalanceBefore = (await userJettonWallet.getGetWalletData()).balance;

        // withdraw
        blockchain.now!! += periodTime;
        const withdrawResult = await withdraw(masterChef, user, masterChefJettonWallet, userWithdrawAmount);
        const userMiniChefAddress = await masterChef.getGetMiniChefAddress(user.address);
        expect(withdrawResult.transactions).toHaveTransaction({
            from: masterChef.address,
            to: userMiniChefAddress,
            success: false,
            exitCode: 19364, // insufficient balance
        });
    });

    // Test handling of WithdrawInternalReply by an entity other than MiniChef.
    it('Should ignore WithdrawInternalReply messages not sent by MiniChef', async () => {
        // Simulate receiving a WithdrawInternalReply message from an unauthorized source and verify it's ignored.
        const userDepositAmount = 1n * TOKEN_DECIMALS;
        // deposit first
        await deposit(masterChef, user, masterChefJettonWallet, usdt, userDepositAmount);
        const withdrawInternalReplyResult = await masterChef.send(
            user.getSender(),
            { value: toNano('1') },
            {
                $$type: 'WithdrawInternalReply',
                queryId: 0n,
                lpTokenAddress: masterChefJettonWallet.address,
                amount: 100000n,
                beneficiary: user.address,
                sender: user.address,
            },
        );
        expect(withdrawInternalReplyResult.transactions).toHaveTransaction({
            from: user.address,
            to: masterChef.address,
            success: false,
            exitCode: 33311, //unexpected sender
        });
    });

    // Test the Harvest function when the contract is not initialized.
    it('Should not allow harvesting when the contract is not initialized', async () => {
        // Attempt to call the Harvest function on an uninitialized contract and expect it to fail.
        ({ deployer, user, kitchen, usdt, seed, deployerJettonWallet } = await setupRevertEnv());
        const harvestResult = await masterChef.send(
            user.getSender(),
            { value: toNano('1') },
            {
                $$type: 'Harvest',
                queryId: 0n,
                lpTokenAddress: masterChefJettonWallet.address,
                beneficiary: user.address,
            },
        );
        expect(harvestResult.transactions).toHaveTransaction({
            from: user.address,
            to: masterChef.address,
            success: false,
            exitCode: 24895, // contract not initialized
        });
    });

    // Test the Harvest function before a pool is added.
    it('Should reject Harvest calls before any pool is added', async () => {
        // Attempt to call Harvest before any pool has been added to the contract and expect failure.
        const harvestResult = await masterChef.send(
            user.getSender(),
            { value: toNano('1') },
            {
                $$type: 'Harvest',
                queryId: 0n,
                lpTokenAddress: masterChefJettonWallet.address,
                beneficiary: user.address,
            },
        );
        expect(harvestResult.transactions).toHaveTransaction({
            from: user.address,
            to: masterChef.address,
            success: false,
            exitCode: 58086, // pool not exists
        });
    });

    // Test unauthorized internal harvest messages sent to MiniChef.
    it('Should reject HarvestInternal messages from non-MasterChef contracts', async () => {
        // Simulate a HarvestInternal message from an unauthorized source and expect rejection.
        const userDepositAmount = 1n * TOKEN_DECIMALS;
        // deposit first
        await deposit(masterChef, user, masterChefJettonWallet, usdt, userDepositAmount);
        const miniChefAddress = await masterChef.getGetMiniChefAddress(user.address);
        const miniChef = blockchain.openContract(await MiniChef.fromAddress(miniChefAddress));
        const harvestInternalResult = await miniChef.send(
            user.getSender(),
            { value: toNano('1') },
            {
                $$type: 'HarvestInternal',
                queryId: 0n,
                lpTokenAddress: masterChefJettonWallet.address,
                beneficiary: user.address,
                accRewardPerShare: 100000n,
            },
        );
        expect(harvestInternalResult.transactions).toHaveTransaction({
            from: user.address,
            to: miniChefAddress,
            success: false,
            exitCode: 31120, // only masterChef can harvest
        });
    });

    // Test handling of HarvestInternalReply by an entity other than MiniChef.
    it('Should ignore HarvestInternalReply messages not sent by MiniChef', async () => {
        // Simulate receiving a HarvestInternalReply message from an unauthorized source and verify it's ignored.
        const userDepositAmount = 1n * TOKEN_DECIMALS;
        // deposit first
        await deposit(masterChef, user, masterChefJettonWallet, usdt, userDepositAmount);
        const harvestInternalReplyResult = await masterChef.send(
            user.getSender(),
            { value: toNano('1') },
            {
                $$type: 'HarvestInternalReply',
                queryId: 0n,
                lpTokenAddress: masterChefJettonWallet.address,
                beneficiary: user.address,
                reward: 100000n,
                sender: user.address,
            },
        );
        expect(harvestInternalReplyResult.transactions).toHaveTransaction({
            from: user.address,
            to: masterChef.address,
            success: false,
            exitCode: 33311, //unexpected sender
        });
    });

    // MasterChef Max Pool Limit  = 400
    it('Should macsterchef has lots of pool', async () => {
        for (let i = 0; i <= 1; i++) {
            let lpToken = blockchain.openContract(
                await JettonMasterUSDT.fromInit(deployer.address, beginCell().storeInt(i, 16).endCell()),
            ); // Reward token and LP token
            let masterChefLpWallet = blockchain.openContract(
                await JettonWalletUSDT.fromInit(masterChef.address, lpToken.address),
            );
            let result = await addPool(masterChef, masterChefLpWallet, 20n);
            await lpToken.send(user.getSender(), { value: toNano('1') }, 'Mint:1');
            // User deposit
            const userDepositAmount = 1n * TOKEN_DECIMALS;
            let depositResult = await deposit(masterChef, user, masterChefLpWallet, lpToken, userDepositAmount);
            // Check the depositResult is successful
            expect(depositResult.transactions).toHaveTransaction({
                from: masterChefLpWallet.address,
                to: masterChef.address,
                success: true,
            });

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: masterChef.address,
                success: true,
            });

            // User Withdraw
            const userWithdrawAmount = 5n * 10n ** 5n;
            let withdrawResult = await withdraw(masterChef, user, masterChefLpWallet, userWithdrawAmount);
            // Check the withdrawResult is successful
            expect(withdrawResult.transactions).toHaveTransaction({
                from: user.address,
                to: masterChef.address,
                success: true,
            });
            // Check that masterchef send withdrawInternal to MiniChef
            let miniChefAddress = await masterChef.getGetMiniChefAddress(user.address);
            expect(withdrawResult.transactions).toHaveTransaction({
                from: masterChef.address,
                to: miniChefAddress,
                success: true,
            });

            // Check that MiniChef send withdrawInternalReply to MasterChef
            expect(withdrawResult.transactions).toHaveTransaction({
                from: miniChefAddress,
                to: masterChef.address,
                success: true,
            });

            // MasterChef transfer the reward to user
            expect(withdrawResult.transactions).toHaveTransaction({
                from: masterChef.address,
                to: masterChefLpWallet.address,
                success: true,
            });
            let userLpWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(user.address, lpToken.address));
            expect(withdrawResult.transactions).toHaveTransaction({
                from: masterChefLpWallet.address,
                to: userLpWallet.address,
                success: true,
            });
        }
    });

    it('Should not let user deposit before start time', async () => {
        ({ deployer, user, kitchen, usdt, seed, deployerJettonWallet } = await setupRevertEnv(20n));
        await initialize(masterChef, deployerJettonWallet, deployer);
        await addPool(masterChef, masterChefJettonWallet);
        const userDepositAmount = 1n * TOKEN_DECIMALS;
        // Mint USDT to user so that he can deposit
        await usdt.send(user.getSender(), { value: toNano('1') }, 'Mint:1');
        const userJettonWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(user.address, usdt.address));

        const userUSDTBefore = (await userJettonWallet.getGetWalletData()).balance;
        // deposit first
        await userJettonWallet.send(
            user.getSender(),
            { value: toNano('1.1') },
            {
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: userDepositAmount,
                destination: masterChef.address,
                response_destination: user.address,
                custom_payload: null,
                forward_ton_amount: toNano('1'),
                forward_payload: beginCell().endCell(),
            },
        );
        // get the balance of usdt After deposit
        const userUSDTAfter = (await userJettonWallet.getGetWalletData()).balance;
        // Because the start time is not reached, MasterChef should return the deposit
        expect(userUSDTAfter).toEqual(userUSDTBefore);
    });

    it('Should not let user withdraw before start time', async () => {
        ({ deployer, user, kitchen, usdt, seed, deployerJettonWallet } = await setupRevertEnv(20n));
        await initialize(masterChef, deployerJettonWallet, deployer);
        await addPool(masterChef, masterChefJettonWallet);
        // Mint USDT to user so that he can deposit

        const withdrawResult = await withdraw(masterChef, user, masterChefJettonWallet, 100n);
        // Should not let user withdraw before start time
        expect(withdrawResult.transactions).toHaveTransaction({
            from: user.address,
            to: masterChef.address,
            success: false,
            exitCode: 48992, // contract not initialized
        });
    });

    it('Should not let user harvest before start time', async () => {
        ({ deployer, user, kitchen, usdt, seed, deployerJettonWallet } = await setupRevertEnv(20n));
        await initialize(masterChef, deployerJettonWallet, deployer);
        await addPool(masterChef, masterChefJettonWallet);
        // Mint USDT to user so that he can deposit

        const harvestResult = await harvest(masterChef, user, masterChefJettonWallet);
        // Should not let user withdraw before start time
        expect(harvestResult.transactions).toHaveTransaction({
            from: user.address,
            to: masterChef.address,
            success: false,
            exitCode: 48992, // contract not initialized
        });
    });

    it('Should not let user WithdrawAndHarvest before start time', async () => {
        ({ deployer, user, kitchen, usdt, seed, deployerJettonWallet } = await setupRevertEnv(20n));
        await initialize(masterChef, deployerJettonWallet, deployer);
        await addPool(masterChef, masterChefJettonWallet);
        // Mint USDT to user so that he can deposit

        const WithdrawAndHarvestResult = await masterChef.send(
            user.getSender(),
            { value: toNano('2') },
            {
                $$type: 'WithdrawAndHarvest',
                queryId: 0n,
                lpTokenAddress: masterChefJettonWallet.address,
                withdrawAmount: 100n,
                beneficiary: user.address,
            },
        );
        // Should not let user withdraw before start time
        expect(WithdrawAndHarvestResult.transactions).toHaveTransaction({
            from: user.address,
            to: masterChef.address,
            success: false,
            exitCode: 48992, // contract not initialized
        });
    });

    it('Should not let protocols transfer reward token after deadline', async () => {
        // Send an insufficient reward amount and verify that it is returned in full.
        ({ deployer, user, kitchen, usdt, seed, deployerJettonWallet } = await setupRevertEnv());

        const ownerBalanceBefore = (await deployerJettonWallet.getGetWalletData()).balance;
        // Update time to let it pass the deadline
        blockchain.now!! += 5000;
        const feeAmont = (totalReward * 3n) / 1000n;
        const extraAmount = 2000000n;
        const initResult = await deployerJettonWallet.send(
            deployer.getSender(),
            {
                value: toNano('1.5'),
            },
            {
                $$type: 'JettonTransfer',
                query_id: 0n,
                amount: totalReward - feeAmont - extraAmount, // Make it insufficient
                destination: masterChef.address,
                response_destination: deployer.address,
                custom_payload: null,
                forward_ton_amount: toNano('1'),
                forward_payload: beginCell().endCell(),
            },
        );

        const ownerBalanceAfter = (await deployerJettonWallet.getGetWalletData()).balance;

        // expect that ownerBalanceBefore and ownerBalanceAfter are equal, which means the entire amount was returned.
        expect(ownerBalanceAfter).toEqual(ownerBalanceBefore);

        // MasterChef Jetton Wallet should return the reward to deployer Jettton Wallet
        expect(initResult.transactions).toHaveTransaction({
            from: masterChefJettonWalletAddress,
            to: deployerJettonWallet.address,
            success: true,
        });
    });
});
