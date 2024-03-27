import { toNano } from '@ton/core';
import { PoolFactory } from '../wrappers/PoolFactory';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const poolFactory = provider.open(await PoolFactory.fromInit());

    await poolFactory.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        {
            $$type: 'Deploy',
            queryId: 0n,
        }
    );

    await provider.waitForDeploy(poolFactory.address);

    // run methods on `poolFactory`
}
