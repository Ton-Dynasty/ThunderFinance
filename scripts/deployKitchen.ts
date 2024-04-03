import { toNano, Address, beginCell } from '@ton/core';
import { Kitchen } from '../wrappers/MasterChef_Kitchen';
import { NetworkProvider } from '@ton/blueprint';
import { updateDeployment } from '../utils/helper';

export async function run(provider: NetworkProvider) {
    const seed = BigInt(`0x${beginCell().storeUint(Date.now(), 64).endCell().hash().toString('hex')}`);
    const kitchen = provider.open(await Kitchen.fromInit(provider.sender().address!!, seed));

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
