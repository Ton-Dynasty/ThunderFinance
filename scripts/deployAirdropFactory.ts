import { beginCell, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { AirdropFactory } from '../wrappers/AirdropFactory';
import { updateDeployment } from '../utils/helper';

export async function run(provider: NetworkProvider) {
    const seed = BigInt(`0x${beginCell().storeUint(Date.now(), 64).endCell().hash().toString("hex")}`);
    const factory = provider.open(await AirdropFactory.fromInit(seed));

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
