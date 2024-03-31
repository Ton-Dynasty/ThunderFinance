import { toNano, Address, beginCell } from '@ton/core';
import { Kitchen } from '../wrappers/MasterChef_Kitchen';
import { NetworkProvider } from '@ton/blueprint';
import { updateDeployment } from '../utils/helper';

export async function run(provider: NetworkProvider) {
    const kitchen = provider.open(await Kitchen.fromInit(provider.sender().address!!, 0n));

    await kitchen.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        {
            $$type: 'Deploy',
            queryId: 0n,
        },
    );

    await provider.waitForDeploy(kitchen.address);
    if (await provider.isContractDeployed(kitchen.address)) {
        await updateDeployment('Kitchen', kitchen.address.toString());
    }
}
