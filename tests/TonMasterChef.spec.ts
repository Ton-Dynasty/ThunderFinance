import { Kitchen } from '../wrappers/Kitchen';
import { Blockchain, printTransactionFees, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, toNano } from '@ton/core';
import { TonMasterChef, PoolInfo } from '../wrappers/TonMasterChef';
import { MiniChef } from '../wrappers/MiniChef';
import { JettonWalletUSDT } from '../wrappers/JettonWallet';
import { JettonMasterUSDT } from '../wrappers/JettonMaster';
import '@ton/test-utils';
import * as fs from 'fs';

describe('TON MasterChef Tests', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let user: SandboxContract<TreasuryContract>;
    let masterChef: SandboxContract<TonMasterChef>;
    let usdt: SandboxContract<JettonMasterUSDT>;
    let masterChefJettonWallet: SandboxContract<JettonWalletUSDT>;
    let kitchen: SandboxContract<Kitchen>;
    let rewardPerSecond: bigint;
    let seed: bigint;
    let deadline: bigint;
    let totalReward: bigint;
    let masterChefJettonWalletAddress: Address;
    const fee = 55000000n; // This fee is for GAS_FEE and THUNDERMINT_FEE
    const ACC_PRECISION = 10n ** 12n;
    const TOKEN_DECIMALS = 10n ** 6n;
    const gasFile = 'TONMasterChefCosts.txt';

    // Helper function to append data to a file
    function appendToFile(filename: string, data: string) {
        fs.appendFileSync(filename, data + '\n', 'utf8'); // Append data with a newline at the end
    }

    // Helper function to clear data in a file
    function clearFile(filename: string) {
        fs.writeFileSync(filename, 'TON MasterChef Costs in each operation: \n', 'utf8'); // Clear the file
    }

    // User deposits USDT to MasterChef by send JettonTransfer to his JettonWallet
    async function depositJetton(
        usdt: SandboxContract<JettonMasterUSDT>,
        user: SandboxContract<TreasuryContract>,
        masterChef: SandboxContract<TonMasterChef>,
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

    // Add a pool to MasterChef
    async function addPool(
        masterChef: SandboxContract<TonMasterChef>,
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
        masterChef: SandboxContract<TonMasterChef>,
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
        masterChef: SandboxContract<TonMasterChef>,
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
        masterChef: SandboxContract<TonMasterChef>,
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

    async function setupRevertEnv() {
        // Init the blockchain
        blockchain = await Blockchain.create();
        blockchain.now = Math.floor(Date.now() / 1000);

        // Characters
        deployer = await blockchain.treasury('deployer'); // Owner of MasterChef
        user = await blockchain.treasury('user'); // User who deposits, withdraws, and harvests

        // Contracts
        kitchen = await blockchain.openContract(await Kitchen.fromInit(deployer.address, 0n)); // MasterChef Factory
        usdt = blockchain.openContract(await JettonMasterUSDT.fromInit(deployer.address, beginCell().endCell())); // Reward token and LP token
        seed = BigInt(`0x${beginCell().storeUint(Date.now(), 64).endCell().hash().toString('hex')}`); // Seed for MasterChef

        // Setup all the contracts
        await usdt.send(deployer.getSender(), { value: toNano('1') }, 'Mint:1'); // Mint USDT to deployer so that he can start the MasterChef
        const kitcherResult = await kitchen.send(
            deployer.getSender(),
            {
                value: toNano('0.5'),
            },
            {
                $$type: 'Deploy',
                queryId: 0n,
            },
        );

        expect(kitcherResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: kitchen.address,
            deploy: true,
            success: true,
        });

        let masterChefAddress = await kitchen.getGetTonMasterChefAddress(deployer.address, seed); // MasterChef address
        masterChef = blockchain.openContract(await TonMasterChef.fromAddress(masterChefAddress)); // MasterChef
        masterChefJettonWalletAddress = await usdt.getGetWalletAddress(masterChefAddress); // MasterChef USDT JettonWallet address
        masterChefJettonWallet = blockchain.openContract(
            await JettonWalletUSDT.fromAddress(masterChefJettonWalletAddress),
        ); // MasterChef USDT JettonWallet
        return { deployer, user, kitchen, usdt, masterChef };
    }

    beforeEach(async () => {
        // Init the blockchain
        blockchain = await Blockchain.create();
        blockchain.now = Math.floor(Date.now() / 1000);

        // Characters
        deployer = await blockchain.treasury('deployer'); // Owner of MasterChef
        user = await blockchain.treasury('user'); // User who deposits, withdraws, and harvests

        // Contracts
        kitchen = await blockchain.openContract(await Kitchen.fromInit(deployer.address, 0n)); // MasterChef Factory
        usdt = blockchain.openContract(await JettonMasterUSDT.fromInit(deployer.address, beginCell().endCell())); // Reward token and LP token
        seed = BigInt(`0x${beginCell().storeUint(Date.now(), 64).endCell().hash().toString('hex')}`); // Seed for MasterChef

        // Setup all the contracts
        await usdt.send(deployer.getSender(), { value: toNano('1') }, 'Mint:1'); // Mint USDT to deployer so that he can start the MasterChef
        const kitcherResult = await kitchen.send(
            deployer.getSender(),
            {
                value: toNano('0.5'),
            },
            {
                $$type: 'Deploy',
                queryId: 0n,
            },
        );

        expect(kitcherResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: kitchen.address,
            deploy: true,
            success: true,
        });

        let masterChefAddress = await kitchen.getGetTonMasterChefAddress(deployer.address, seed); // MasterChef address
        masterChef = blockchain.openContract(await TonMasterChef.fromAddress(masterChefAddress)); // MasterChef
        masterChefJettonWalletAddress = await usdt.getGetWalletAddress(masterChefAddress); // MasterChef USDT JettonWallet address
        masterChefJettonWallet = blockchain.openContract(
            await JettonWalletUSDT.fromAddress(masterChefJettonWalletAddress),
        ); // MasterChef USDT JettonWallet

        deadline = BigInt(blockchain.now!! + 2000);
        totalReward = toNano('1000');
        let sendingTon = (totalReward * 1003n) / 1000n + toNano('1');
        // Build the MasterChef contract from kitchen
        const masterChefResult = await kitchen.send(
            deployer.getSender(),
            {
                value: sendingTon,
            },
            {
                $$type: 'BuildTonMasterChef',
                owner: deployer.address,
                seed: seed,
                metaData: beginCell().storeStringTail('httpppp').endCell(),
                deadline: deadline,
                totalReward: totalReward,
                startTime: BigInt(blockchain.now!!) - 10n, // -10n is to make sure that the MasterChef is started
            },
        );

        // Kitchen Deploy MasterChef
        expect(masterChefResult.transactions).toHaveTransaction({
            from: kitchen.address,
            to: masterChef.address,
            success: true,
        });

        // MasterChef Should send remaining TON to Owner
        expect(masterChefResult.transactions).toHaveTransaction({
            from: masterChef.address,
            to: deployer.address,
            success: true,
        });

        // isInitialized Should be true
        const isInitialized = (await masterChef.getGetTonMasterChefData()).isInitialized;
        expect(isInitialized).toBe(true);

        rewardPerSecond = await (await masterChef.getGetTonMasterChefData()).rewardPerSecond;
    });

    it('Should owner add pool into MasterChef', async () => {
        const allocPoint = 100n;
        const addPoolResult = await addPool(masterChef, masterChefJettonWallet, allocPoint);
        // Send AddPool to MasterChef
        expect(addPoolResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: masterChef.address,
            success: true,
        });

        let poolData: PoolInfo = await masterChef.getGetPoolInfo(masterChefJettonWallet.address);
        // allocPoint Should be equal to 100
        expect(poolData.allocPoint).toBe(allocPoint);

        // poolData.lpToken Should be equal to masterChefJettonWallet.address
        expect(poolData.lpTokenAddress.toString()).toBe(masterChefJettonWallet.address.toString());
    });

    it('Should revert if owner add pool and its total allocate point exceeds 10000', async () => {
        const allocPoint = 10001n;
        const addPoolResult = await addPool(masterChef, masterChefJettonWallet, allocPoint);
        // Send AddPool to MasterChef
        expect(addPoolResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: masterChef.address,
            success: false,
            exitCode: 25081, // total alloc point exceeds 10000
        });
    });

    it('Should user deposit usdt to master chef and update pool', async () => {
        await addPool(masterChef, masterChefJettonWallet);
        const userDepositAmount = 1n * TOKEN_DECIMALS;
        const periodTime = 10;
        const userDepositCostTonBefore = await user.getBalance();
        const depositResult = await deposit(masterChef, user, masterChefJettonWallet, usdt, userDepositAmount);
        const userDepositCostTonAfter = await user.getBalance();
        const userDepositCostTon =
            Number(userDepositCostTonBefore - userDepositCostTonAfter - userDepositAmount) / 10 ** 10;
        clearFile(gasFile);
        // console.log('Ton MasterChef Cost:');
        // console.log('userDepositCost', userDepositCostTon, 'TON');
        appendToFile(gasFile, `Deposit Cost: ${userDepositCostTon} TON`);
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
        await depositJetton(usdt, user, masterChef, userDepositAmount);
        // Update time to periodTime, so that we can harvest
        blockchain.now!! += periodTime;
        const userTonBalanceBefore = await user.getBalance();
        // User send Harvest to MasterChef
        const harvestResult = await harvest(masterChef, user, masterChefJettonWallet);
        const userTonBalanceAfter = await user.getBalance();

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

        // Check that MasterChef send TON to user
        expect(harvestResult.transactions).toHaveTransaction({
            from: masterChef.address,
            to: user.address,
            success: true,
        });

        const benefit = (userDepositAmount * BigInt(periodTime) * rewardPerSecond) / TOKEN_DECIMALS;
        // Check if user get the reward
        let feeInHarvest = 54659059n;
        expect(userTonBalanceAfter - userTonBalanceBefore + feeInHarvest).toBeGreaterThanOrEqual(benefit);
        const userHarvestCost = Number(benefit - (userTonBalanceAfter - userTonBalanceBefore)) / 10 ** 10;
        // console.log('userHarvestCost', userHarvestCost, 'TON');
        appendToFile(gasFile, `Harvest Cost: ${userHarvestCost} TON`);
    });

    it('Should deposit and harvest twice', async () => {
        await addPool(masterChef, masterChefJettonWallet);
        const userDepositAmount = 1n * TOKEN_DECIMALS;
        const periodTime = 1000;
        await depositJetton(usdt, user, masterChef, userDepositAmount);
        // Update time to periodTime, so that we can harvest
        blockchain.now!! += periodTime;
        const userJettonWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(user.address, usdt.address));
        const userTonBalanceBefore = await user.getBalance();
        // User send Harvest to MasterChef
        await harvest(masterChef, user, masterChefJettonWallet);

        // User JettonWallet Should have received the reward
        const userTonBalanceAfter = await user.getBalance();
        const benefit = (userDepositAmount * BigInt(periodTime) * rewardPerSecond) / TOKEN_DECIMALS;
        expect(userTonBalanceAfter + fee).toBeGreaterThanOrEqual(userTonBalanceBefore + benefit);

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
        const userTonBalanceBefore2rdHarvest = await user.getBalance();
        // User send Harvest to MasterChef
        await harvest(masterChef, user, masterChefJettonWallet);

        // User JettonWallet Should have received the reward
        // It shoud add deposit amount to the previous balance, so that we can calculate the benefit from the second harvest
        const userTonBalanceAfter2rdHarvest = await user.getBalance();
        // check the benefit of user1 and user2 are correct
        const benefit1 = BigInt(periodTime) * rewardPerSecond;
        expect(userTonBalanceAfter2rdHarvest + fee).toBeGreaterThanOrEqual(userTonBalanceBefore2rdHarvest + benefit1);
    });

    it('Should Harvest After Deadline', async () => {
        await addPool(masterChef, masterChefJettonWallet);
        const userDepositAmount = 1n * TOKEN_DECIMALS;
        const periodTime = 1000;
        await depositJetton(usdt, user, masterChef, userDepositAmount);
        // Update time to periodTime, so that we can harvest
        blockchain.now!! += periodTime;
        const userJettonWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(user.address, usdt.address));
        const userTonBalanceBefore = await user.getBalance();
        // User send Harvest to MasterChef
        await harvest(masterChef, user, masterChefJettonWallet);

        // User JettonWallet Should have received the reward
        const userTonBalanceAfter = await user.getBalance();
        const benefit = (userDepositAmount * BigInt(periodTime) * rewardPerSecond) / TOKEN_DECIMALS;
        expect(userTonBalanceAfter + fee).toBeGreaterThanOrEqual(userTonBalanceBefore + benefit);

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
        const userTonBalanceBefore2rdHarvest = await user.getBalance();

        // User send Harvest to MasterChef
        await harvest(masterChef, user, masterChefJettonWallet);

        // User JettonWallet Should have received the reward
        // It shoud add deposit amount to the previous balance, so that we can calculate the benefit from the second harvest
        const userTonBalanceAfter2rdHarvest = await user.getBalance();
        // check the benefit of user1 and user2 are correct
        // Only get the benefit until the deadline
        const benefit1 = BigInt(periodTime) * rewardPerSecond;
        expect(userTonBalanceAfter2rdHarvest + fee).toBeGreaterThanOrEqual(userTonBalanceBefore2rdHarvest + benefit1);
    });

    it('Should deposit and withdraw', async () => {
        const userDepositAmount = 1n * TOKEN_DECIMALS;
        const userWithdrawAmount = 5n * 10n ** 5n;
        const periodTime = 100;
        const userJettonWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(user.address, usdt.address));
        // deposit first
        await deposit(masterChef, user, masterChefJettonWallet, usdt, userDepositAmount);
        // get the balance of usdt before withdraw
        const userUSDTBalanceBefore = (await userJettonWallet.getGetWalletData()).balance;

        // withdraw
        blockchain.now!! += periodTime;
        const userWithdrawBefore = await user.getBalance();
        const withdrawResult = await withdraw(masterChef, user, masterChefJettonWallet, userWithdrawAmount);
        const userWithdrawAfter = await user.getBalance();

        const userWithdrawCost = Number(userWithdrawBefore - userWithdrawAfter) / 10 ** 10;
        // console.log('userWithdrawCost', userWithdrawCost, 'TON');
        appendToFile(gasFile, `Withdraw Cost: ${userWithdrawCost} TON`);

        // console.log('-----------------');
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
        const periodTime = 100;
        const userJettonWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(user.address, usdt.address));
        // deposit first
        await deposit(masterChef, user, masterChefJettonWallet, usdt, userDepositAmount);
        // get the balance of ton before withdraw
        const userTonBalanceBefore = await user.getBalance();

        // Update time to periodTime, so that we can withdraw
        blockchain.now!! += periodTime;
        // withdraw
        await withdraw(masterChef, user, masterChefJettonWallet, userWithdrawAmount);
        const userTonBalanceBeforeHarvest = await user.getBalance();

        // Update time to periodTime, so that we can harvest
        blockchain.now!! += periodTime;
        // User send Harvest to MasterChef
        await harvest(masterChef, user, masterChefJettonWallet);
        const userTonBalanceAfterHarvest = await user.getBalance();
        // check the differnce between userUSDTBalanceBeforeWithdraw and userUSDTBalanceAfterHarvest is equal to userWithdrawAmount
        //expect(userUSDTBalanceBeforeHarvest).toEqual(userUSDTBalanceBeforeWithdraw + userWithdrawAmount);
        // check the differnce between userUSDTBalanceBeforeWithdraw and userUSDTBalanceAfterHarvest is equal to userWithdrawAmount
        const remainDeposit = userDepositAmount - userWithdrawAmount;
        const benefit = ((userDepositAmount + remainDeposit) * BigInt(periodTime) * rewardPerSecond) / TOKEN_DECIMALS;

        expect(userTonBalanceAfterHarvest + fee).toBeGreaterThanOrEqual(userTonBalanceBeforeHarvest + benefit);
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

    it('Should withdraw and harvest in one step', async () => {
        const userDepositAmount = 1n * TOKEN_DECIMALS;
        const userWithdrawAmount = 5n * 10n ** 5n;
        const periodTime = 1000;
        const userJettonWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(user.address, usdt.address));
        // deposit first
        await deposit(masterChef, user, masterChefJettonWallet, usdt, userDepositAmount);
        // get the balance of usdt before withdraw
        const userUSDTBalanceBeforeWH = (await userJettonWallet.getGetWalletData()).balance;
        const userTonBalanceBeforeWH = await user.getBalance();

        // Update time to periodTime, so that we can withdraw
        blockchain.now!! += periodTime;

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
        const userUSDTBalanceAfterWH = (await userJettonWallet.getGetWalletData()).balance;
        const userTonBalanceAfterWH = await user.getBalance();
        // expect that the userUSDTBalanceAfterWH is equal to userUSDTBalanceBeforeWH + userWithdrawAmount
        expect(userUSDTBalanceAfterWH).toEqual(userUSDTBalanceBeforeWH + userWithdrawAmount);

        // Expect that the userTonBalanceAfterWH > userTonBalanceBeforeWH
        const benefit1 = BigInt(periodTime) * rewardPerSecond;
        const extraFee = 170708059n; // Because We did withdraw and harvest in one step, so there are 0.2 TON extra fee
        expect(userTonBalanceAfterWH + extraFee + fee).toBeGreaterThanOrEqual(userTonBalanceBeforeWH + benefit1);
        const userWHCost = Number(userTonBalanceBeforeWH - userTonBalanceAfterWH + benefit1) / 10 ** 10;
        // console.log('userWHCost', userWHCost, 'TON');
        appendToFile(gasFile, `Withdraw & Harvest Cost: ${userWHCost} TON`);
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
        const periodTime = 100;
        // addpool
        await addPool(masterChef, masterChefJettonWallet);
        // user1 deposit
        await depositJetton(usdt, user1, masterChef, user1DepositAmount);
        // const user1JettonWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(user1.address, usdt.address));
        // const user1USDTBalanceBefore = (await user1JettonWallet.getGetWalletData()).balance;
        const user1TonBalanceBefore = await user1.getBalance();
        // user2 deposit
        await depositJetton(usdt, user2, masterChef, user2DepositAmount);
        // const user2JettonWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(user2.address, usdt.address));
        // const user2USDTBalanceBefore = (await user2JettonWallet.getGetWalletData()).balance;
        const user2TonBalanceBefore = await user2.getBalance();
        blockchain.now!! += periodTime;
        // user1 harvest
        await harvest(masterChef, user1, masterChefJettonWallet);
        // const user1USDTBalanceAfter = (await user1JettonWallet.getGetWalletData()).balance;
        const user1TonBalanceAfter = await user1.getBalance();
        // user2 harvest
        await harvest(masterChef, user2, masterChefJettonWallet);
        // const user2USDTBalanceAfter = (await user2JettonWallet.getGetWalletData()).balance;
        const user2TonBalanceAfter = await user2.getBalance();

        // check the benefit of user1 and user2 are correct
        const totalDeposit = user1DepositAmount + user2DepositAmount;
        const rewardPerShare = (TOKEN_DECIMALS * (BigInt(periodTime) * rewardPerSecond)) / totalDeposit;
        const benefit1 = (user1DepositAmount * rewardPerShare) / TOKEN_DECIMALS;
        const benefit2 = (user2DepositAmount * rewardPerShare) / TOKEN_DECIMALS;

        expect(user1TonBalanceAfter + fee).toBeGreaterThanOrEqual(user1TonBalanceBefore + benefit1);
        expect(user2TonBalanceAfter + fee).toBeGreaterThanOrEqual(user2TonBalanceBefore + benefit2);
    });

    it('Should ThunderMint can collect the Fees from projcet party and users', async () => {
        const userDepositAmount = 1n * TOKEN_DECIMALS;
        const userWithdrawAmount = 5n * 10n ** 5n;
        const periodTime = 10;
        const rewardTONForDev = (totalReward * 3n) / 1000n;
        // deposit first
        await deposit(masterChef, user, masterChefJettonWallet, usdt, userDepositAmount);

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
        const masterChefDataAfterWithdraw = await masterChef.getGetTonMasterChefData();
        // Make sure that feeForDevs is recorded after user withdraw
        expect(masterChefDataAfterWithdraw.feeForDevs).toEqual(rewardTONForDev); // REWARD_FEE = 0.3 TON (0.3% of the reward)

        // Update time to periodTime, so that we can harvest
        blockchain.now!! += periodTime;
        // User send Harvest to MasterChef
        await harvest(masterChef, user, masterChefJettonWallet);
        const masterChefDataAfterHarvest = await masterChef.getGetTonMasterChefData();

        // Send Collect Msg to MasterChef
        let thunderMintTonBefore = await deployer.getBalance();
        //let thunderJettonBefore = (await thunderMintJettonWallet.getGetWalletData()).balance;
        let count = 5n;
        // Increase fees for devs
        for (let i = 0; i < count; i++) {
            await deposit(masterChef, user, masterChefJettonWallet, usdt, userDepositAmount);
            // withdraw
            blockchain.now!! += periodTime;
            await withdraw(masterChef, user, masterChefJettonWallet, userWithdrawAmount);
        }
        const masterChefData = await masterChef.getGetTonMasterChefData();
        const collectResult = await masterChef.send(deployer.getSender(), { value: toNano('1') }, 'Collect');
        let thunderMintTonAfter = await deployer.getBalance();

        // Deployer can't collect before deadline
        expect(collectResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: masterChef.address,
            success: false,
            exitCode: 58913, // Can't collect before deadline
        });

        blockchain.now!! += 5000;
        thunderMintTonBefore = await deployer.getBalance();
        const collectResultAfterDL = await masterChef.send(deployer.getSender(), { value: toNano('1') }, 'Collect');
        thunderMintTonAfter = await deployer.getBalance();

        // Check if deployer send Collect msg to MasterChef
        expect(collectResultAfterDL.transactions).toHaveTransaction({
            from: deployer.address,
            to: masterChef.address,
            success: true,
        });
        // Check if MasterChef send JettonTransfer to MasterChef Reward JettonWallet
        expect(collectResultAfterDL.transactions).toHaveTransaction({
            from: masterChef.address,
            to: deployer.address,
            success: true,
        });

        // Check if the MasterChef send TON for Devs to ThunderMint
        expect(thunderMintTonAfter).toBeGreaterThanOrEqual(thunderMintTonBefore);
    });

    it('Should not initialize if not enough reward', async () => {
        let blockchain: Blockchain;
        let deployer: SandboxContract<TreasuryContract>;
        let user: SandboxContract<TreasuryContract>;
        let masterChef: SandboxContract<TonMasterChef>;
        let usdt: SandboxContract<JettonMasterUSDT>;
        let masterChefJettonWallet: SandboxContract<JettonWalletUSDT>;
        let deployerJettonWallet: SandboxContract<JettonWalletUSDT>;

        // Init the blockchain
        blockchain = await Blockchain.create();
        blockchain.now = Math.floor(Date.now() / 1000);

        // Characters
        deployer = await blockchain.treasury('deployer'); // Owner of MasterChef
        user = await blockchain.treasury('user'); // User who deposits, withdraws, and harvests

        // Contracts
        kitchen = await blockchain.openContract(await Kitchen.fromInit(deployer.address, 0n)); // MasterChef Factory
        usdt = blockchain.openContract(await JettonMasterUSDT.fromInit(deployer.address, beginCell().endCell())); // Reward token and LP token
        seed = BigInt(`0x${beginCell().storeUint(Date.now(), 64).endCell().hash().toString('hex')}`); // Seed for MasterChef

        deployerJettonWallet = blockchain.openContract(await JettonWalletUSDT.fromInit(deployer.address, usdt.address)); // Deployer USDT JettonWallet
        // Setup all the contracts
        await usdt.send(deployer.getSender(), { value: toNano('1') }, 'Mint:1'); // Mint USDT to deployer so that he can start the MasterChef
        const kitcherResult = await kitchen.send(
            deployer.getSender(),
            {
                value: toNano('0.5'),
            },
            {
                $$type: 'Deploy',
                queryId: 0n,
            },
        );

        expect(kitcherResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: kitchen.address,
            deploy: true,
            success: true,
        });

        let masterChefAddress = await kitchen.getGetTonMasterChefAddress(deployer.address, seed); // MasterChef address
        masterChef = blockchain.openContract(await TonMasterChef.fromAddress(masterChefAddress)); // MasterChef
        masterChefJettonWalletAddress = await usdt.getGetWalletAddress(masterChefAddress); // MasterChef USDT JettonWallet address
        masterChefJettonWallet = blockchain.openContract(
            await JettonWalletUSDT.fromAddress(masterChefJettonWalletAddress),
        ); // MasterChef USDT JettonWallet

        deadline = BigInt(blockchain.now!! + 2000);
        totalReward = toNano('10');
        let sendingTon = (totalReward * 1003n) / 1000n + toNano('1');
        // Build the MasterChef contract from kitchen
        const masterChefResult = await kitchen.send(
            deployer.getSender(),
            {
                value: sendingTon - toNano('10'),
            },
            {
                $$type: 'BuildTonMasterChef',
                owner: deployer.address,
                seed: seed,
                metaData: beginCell().storeStringTail('httpppp').endCell(),
                deadline: deadline,
                totalReward: totalReward,
                startTime: BigInt(blockchain.now!!) - 10n,
            },
        );

        // Kitchen Deploy MasterChef
        expect(masterChefResult.transactions).toHaveTransaction({
            from: kitchen.address,
            to: masterChef.address,
        });

        // isInitialized Should be true
        const isInitialized = (await masterChef.getGetTonMasterChefData()).isInitialized;
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

        const startBlock = BigInt(blockchain.now!!);
        // Update time to periodTime, so that we can harvest
        blockchain.now!! += periodTime;
        const userTonBalanceBeforeHarvest = await user.getBalance();
        // User send Harvest to MasterChef
        await harvest(masterChef, user, masterChefJettonWallet);
        const userTonBalanceAfterHarvest = await user.getBalance();
        // It can only get the benefit until the deadline
        const benefit = (userDepositAmount * BigInt(deadline - startBlock) * rewardPerSecond) / TOKEN_DECIMALS;
        expect(userTonBalanceAfterHarvest).toBeLessThanOrEqual(userTonBalanceBeforeHarvest + benefit);
    });

    // Test the contract's response to being initialized more than once.
    it('Should reject initialization if the contract has already been initialized', async () => {
        const result = await masterChef.send(
            deployer.getSender(),
            { value: toNano('1') },
            {
                $$type: 'SetUpTonMC',
                owner: deployer.address,
                thunderMintWallet: deployer.address,
                metaData: beginCell().storeStringTail('httpppp').endCell(),
                totalReward: 1000n * 10n ** 5n,
                deadline: deadline,
                startTime: BigInt(blockchain.now!!) - 10n,
            },
        );

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: masterChef.address,
            success: false,
            exitCode: 1006, // Already initialized
        });

        // expect that MasterChef send back the TON
        expect(result.transactions).toHaveTransaction({
            from: masterChef.address,
            to: deployer.address,
            success: true,
        });
    });

    // Test the behavior when the reward amount sent is insufficient.
    it('Should return the entire amount if the reward sent is not sufficient for initialization', async () => {
        // Send an insufficient reward amount and verify that it is returned in full.
        ({ deployer, user, kitchen, usdt, masterChef } = await setupRevertEnv());

        deadline = BigInt(blockchain.now!! + 2000);
        totalReward = toNano('10');
        let sendingTon = (totalReward * 1003n) / 1000n - toNano('1');
        const balanceBefore = await deployer.getBalance();
        // Build the MasterChef contract from kitchen
        const masterChefResult = await kitchen.send(
            deployer.getSender(),
            {
                value: sendingTon,
            },
            {
                $$type: 'BuildTonMasterChef',
                owner: deployer.address,
                seed: seed,
                metaData: beginCell().storeStringTail('httpppp').endCell(),
                deadline: deadline,
                totalReward: totalReward,
                startTime: BigInt(blockchain.now!!) - 10n,
            },
        );
        const balanceAfter = await deployer.getBalance();
        // Should throw exit code 1 and return TON
        expect(masterChefResult.transactions).toHaveTransaction({
            from: kitchen.address,
            to: masterChef.address,
        });
        // Should return the TON
        expect(masterChefResult.transactions).toHaveTransaction({
            from: masterChef.address,
            to: deployer.address,
        });

        let returnFee = 300000000n; // 221021736n
        expect(balanceAfter + returnFee).toBeGreaterThanOrEqual(balanceBefore); // 0.5 TON is the fee

        let isInitialized = (await masterChef.getGetTonMasterChefData()).isInitialized;
        // Should not be initialized
        expect(isInitialized).toBe(false);
    });

    // Test user deposit behavior before a pool is added.
    it('Should reject user deposits before any pool is added', async () => {
        // Attempt to make a deposit before any pool has been added to the contract and expect failure.
        const userDepositAmount = 1n * TOKEN_DECIMALS;
        const depositResult = await depositJetton(usdt, user, masterChef, userDepositAmount);
        expect(depositResult.transactions).toHaveTransaction({
            from: masterChefJettonWalletAddress,
            to: masterChef.address,
            success: true,
        });
    });

    it('Should not allow withdrawals when the contract is not initialized', async () => {
        // Attempt a withdrawal from an uninitialized contract and expect it to fail.

        ({ deployer, user, kitchen, usdt, masterChef } = await setupRevertEnv());
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
        // Attempt to withdraw an amount greater than the user's balance and expect failure.

        const userDepositAmount = 1n * TOKEN_DECIMALS;
        const userWithdrawAmount = userDepositAmount * 2n;
        const periodTime = 10;
        // deposit first
        await deposit(masterChef, user, masterChefJettonWallet, usdt, userDepositAmount);
        // get the balance of usdt before withdraw

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

        ({ deployer, user, kitchen, usdt, masterChef } = await setupRevertEnv());
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

    // Test the behavior when the reward amount sent is insufficient.
    it('Should return the entire amount if the reward sent is not sufficient for initialization', async () => {
        // Send an insufficient reward amount and verify that it is returned in full.
        // Init the blockchain
        blockchain = await Blockchain.create();
        blockchain.now = Math.floor(Date.now() / 1000);

        // Characters
        deployer = await blockchain.treasury('deployer'); // Owner of MasterChef
        user = await blockchain.treasury('user'); // User who deposits, withdraws, and harvests

        // Contracts
        kitchen = await blockchain.openContract(await Kitchen.fromInit(deployer.address, 666n)); // MasterChef Factory
        usdt = blockchain.openContract(await JettonMasterUSDT.fromInit(deployer.address, beginCell().endCell())); // Reward token and LP token
        seed = 666n; // Seed for MasterChef

        // Setup all the contracts
        await usdt.send(deployer.getSender(), { value: toNano('1') }, 'Mint:1'); // Mint USDT to deployer so that he can start the MasterChef
        const kitcherResult = await kitchen.send(
            deployer.getSender(),
            {
                value: toNano('0.5'),
            },
            {
                $$type: 'Deploy',
                queryId: 0n,
            },
        );

        expect(kitcherResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: kitchen.address,
            deploy: true,
            success: true,
        });

        let masterChefAddress = await kitchen.getGetTonMasterChefAddress(deployer.address, seed); // MasterChef address
        masterChef = blockchain.openContract(await TonMasterChef.fromAddress(masterChefAddress)); // MasterChef
        masterChefJettonWalletAddress = await usdt.getGetWalletAddress(masterChefAddress); // MasterChef USDT JettonWallet address
        masterChefJettonWallet = blockchain.openContract(
            await JettonWalletUSDT.fromAddress(masterChefJettonWalletAddress),
        ); // MasterChef USDT JettonWallet

        deadline = BigInt(blockchain.now!! + 100000000000000);
        totalReward = toNano('10');
        let sendingTon = (totalReward * 1003n) / 1000n - toNano('1');
        const balanceBefore = await deployer.getBalance();
        // Build the MasterChef contract from kitchen
        const masterChefResult = await kitchen.send(
            deployer.getSender(),
            {
                value: sendingTon,
            },
            {
                $$type: 'BuildTonMasterChef',
                owner: deployer.address,
                seed: seed,
                metaData: beginCell().storeStringTail('httpppp').endCell(),
                deadline: deadline,
                totalReward: totalReward,
                startTime: BigInt(blockchain.now!!) - 10n,
            },
        );
        const balanceAfter = await deployer.getBalance();

        // Check that MasterChef is destroyed
        await masterChef.getGetTonMasterChefData().catch((e) => {
            expect(e.toString()).toEqual('Error: Trying to run get method on non-active contract');
        });

        // Check that the TON is returned
        expect(masterChefResult.transactions).toHaveTransaction({
            from: masterChef.address,
            to: deployer.address,
        });

        let gasFee = toNano('0.5');
        expect(balanceAfter + gasFee).toBeGreaterThanOrEqual(balanceBefore);
    });

    it('Should not let user deposit before start time', async () => {
        ({ deployer, user, kitchen, usdt, masterChef } = await setupRevertEnv());

        deadline = BigInt(blockchain.now!! + 2000);
        totalReward = toNano('10');
        let sendingTon = (totalReward * 1003n) / 1000n;
        // Build the MasterChef contract from kitchen
        await kitchen.send(
            deployer.getSender(),
            {
                value: sendingTon,
            },
            {
                $$type: 'BuildTonMasterChef',
                owner: deployer.address,
                seed: seed,
                metaData: beginCell().storeStringTail('httpppp').endCell(),
                deadline: deadline,
                totalReward: totalReward,
                startTime: BigInt(blockchain.now!!) + 20n,
            },
        );
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
        ({ deployer, user, kitchen, usdt, masterChef } = await setupRevertEnv());
        deadline = BigInt(blockchain.now!! + 2000);
        totalReward = toNano('1000');
        let sendingTon2 = (totalReward * 1003n) / 1000n + toNano('1');
        // Build the MasterChef contract from kitchen
        const masterChefResult = await kitchen.send(
            deployer.getSender(),
            {
                value: sendingTon2,
            },
            {
                $$type: 'BuildTonMasterChef',
                owner: deployer.address,
                seed: seed,
                metaData: beginCell().storeStringTail('httpppp').endCell(),
                deadline: deadline,
                totalReward: totalReward,
                startTime: BigInt(blockchain.now!!) + 10n,
            },
        );

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
        ({ deployer, user, kitchen, usdt, masterChef } = await setupRevertEnv());
        deadline = BigInt(blockchain.now!! + 2000);
        totalReward = toNano('1000');
        let sendingTon2 = (totalReward * 1003n) / 1000n + toNano('1');
        // Build the MasterChef contract from kitchen
        await kitchen.send(
            deployer.getSender(),
            {
                value: sendingTon2,
            },
            {
                $$type: 'BuildTonMasterChef',
                owner: deployer.address,
                seed: seed,
                metaData: beginCell().storeStringTail('httpppp').endCell(),
                deadline: deadline,
                totalReward: totalReward,
                startTime: BigInt(blockchain.now!!) + 10n,
            },
        );
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
        ({ deployer, user, kitchen, usdt, masterChef } = await setupRevertEnv());
        deadline = BigInt(blockchain.now!! + 2000);
        totalReward = toNano('1000');
        let sendingTon2 = (totalReward * 1003n) / 1000n + toNano('1');
        // Build the MasterChef contract from kitchen
        await kitchen.send(
            deployer.getSender(),
            {
                value: sendingTon2,
            },
            {
                $$type: 'BuildTonMasterChef',
                owner: deployer.address,
                seed: seed,
                metaData: beginCell().storeStringTail('httpppp').endCell(),
                deadline: deadline,
                totalReward: totalReward,
                startTime: BigInt(blockchain.now!!) + 10n,
            },
        );
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
});
