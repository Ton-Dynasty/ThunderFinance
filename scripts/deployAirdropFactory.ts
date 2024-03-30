import { toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { AirdropFactory } from '../wrappers/AirdropFactory';
import { updateDeployment } from '../utils/helper';

function randBigInt(): bigint {
    return BigInt(Math.floor(Math.random() * 1000000000000000));
}

export async function run(provider: NetworkProvider) {
    const factory = provider.open(await AirdropFactory.fromInit(randBigInt()));

    await factory.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        {
            $$type: 'Deploy',
            queryId: 0n,
        },
    );

    await provider.waitForDeploy(factory.address);

    if (await provider.isContractDeployed(factory.address)) {
        await updateDeployment('AirdropFactory', factory.address.toString());
    }
}
