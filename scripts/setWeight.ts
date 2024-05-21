import { toNano, Address, beginCell } from '@ton/core';
import { JettonMasterChef } from '../wrappers/JettonMasterChef';
import { NetworkProvider } from '@ton/blueprint';
import { loadDeployment } from '../utils/helper';
import { JettonMinter } from '../wrappers/JettonMinter';
import { JettonWallet } from '../wrappers/RealJettonWallet';

export async function run(provider: NetworkProvider) {
    const deployment = await loadDeployment();

    const masterchef = provider.open(JettonMasterChef.fromAddress(Address.parse(deployment.MasterChef)));
    console.log('MasterChef address:', masterchef.address.toString());

    const lpJettonWalletAddress = await provider
        .ui()
        .inputAddress('Please enter the LP Jetton Wallet address of Masterchef for setting weight:');
    const newAllocPoint = await provider.ui().input('Please enter the new allocPoint:');

    await masterchef.send(
        provider.sender(),
        {
            value: toNano('0.08'),
        },
        {
            $$type: 'Set',
            lpTokenAddress: lpJettonWalletAddress,
            allocPoint: BigInt(newAllocPoint),
        },
    );
}
