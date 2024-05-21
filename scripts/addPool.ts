import { toNano, Address, beginCell } from '@ton/core';
import { JettonMasterChef } from '../wrappers/JettonMasterChef';
import { NetworkProvider } from '@ton/blueprint';
import { loadDeployment } from '../utils/helper';

export async function run(provider: NetworkProvider) {
    const deployment = await loadDeployment();

    const masterchef = provider.open(JettonMasterChef.fromAddress(Address.parse(deployment.MasterChef)));
    console.log('MasterChef address:', masterchef.address.toString());
    const lpJettonWalletAddress = await provider
        .ui()
        .inputAddress('Please enter the LP Jetton Wallet address of Masterchef for adding pool:');
    const allocPoint = await provider.ui().input('Please enter the allocPoint:');

    await masterchef.send(
        provider.sender(),
        {
            value: toNano('0.8'),
        },
        {
            $$type: 'AddPool',
            lpTokenAddress: lpJettonWalletAddress,
            allocPoint: BigInt(allocPoint),
            queryId: 10n,
        },
    );
}
