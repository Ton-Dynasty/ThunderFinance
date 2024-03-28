import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, toNano } from '@ton/core';
import { MasterChef } from '../wrappers/MasterChef';
import { MiniChef } from '../wrappers/MiniChef';
import { JettonWalletUSDT } from '../wrappers/JettonWallet';
import { JettonMasterUSDT } from '../wrappers/JettonMaster';
import '@ton/test-utils';

describe('PoolFactory', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let masterChef: SandboxContract<MasterChef>;
    let usdt: SandboxContract<JettonMasterUSDT>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        masterChef = blockchain.openContract(await MasterChef.fromInit(deployer.address, 100n));
        usdt = blockchain.openContract(await JettonMasterUSDT.fromInit(deployer.address, beginCell().endCell()));

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
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and poolFactory are ready to use
    });

    it('Should add pool', async () => {
        const addPoolResult = await masterChef.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'AddPool',
                lpTokenAddress: usdt.address,
                allocPoint: 100n,
            },
        );

        expect(addPoolResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: masterChef.address,
            success: true,
            op: 1266490084,
        });
    });

    it('Should deposit', async () => {});

    it('Should deposit and harvest', async () => {});

    it('Should deposit and withdraw', async () => {});

    it('Should deposit and withdarw with harvest', async () => {});
});
