import { toNano, Address, beginCell } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { JettonMasterUSDT } from '../wrappers/JettonMaster';
import { updateDeployment } from '../utils/helper';

export async function run(provider: NetworkProvider) {
    // use static usdt address with decimals 6
    const usdt = provider.open(
        JettonMasterUSDT.fromAddress(Address.parse('kQBqSpvo4S87mX9tjHaG4zhYZeORhVhMapBJpnMZ64jhrP-A')),
    );
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
