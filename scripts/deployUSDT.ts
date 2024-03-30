import { toNano, Address, beginCell } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { JettonMasterUSDT } from '../wrappers/JettonMaster';
import { updateDeployment } from '../utils/helper';

export async function run(provider: NetworkProvider) {
    const usdt = provider.open(await JettonMasterUSDT.fromInit(provider.sender().address!!, beginCell().endCell()));
    await usdt.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        {
            $$type: 'Deploy',
            queryId: 0n,
        },
    );

    await provider.waitForDeploy(usdt.address);
    if (await provider.isContractDeployed(usdt.address)) {
        await updateDeployment('USDT', usdt.address.toString());
    }
}
