import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { toNano } from '@ton/core';
import { PoolFactory } from '../wrappers/PoolFactory';
import '@ton/test-utils';

describe('PoolFactory', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let poolFactory: SandboxContract<PoolFactory>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        poolFactory = blockchain.openContract(await PoolFactory.fromInit());

        deployer = await blockchain.treasury('deployer');

        const deployResult = await poolFactory.send(
            deployer.getSender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'Deploy',
                queryId: 0n,
            }
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: poolFactory.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and poolFactory are ready to use
    });
});
