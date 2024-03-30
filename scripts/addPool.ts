import { toNano, Address, beginCell } from '@ton/core';
import { MasterChef } from '../wrappers/MasterChef';
import { JettonWalletUSDT } from '../wrappers/JettonWallet';
import { NetworkProvider } from '@ton/blueprint';
import { loadDeployment } from '../utils/helper';

export async function run(provider: NetworkProvider) {
    const deployment = await loadDeployment();
    const masterchef = provider.open(MasterChef.fromAddress(Address.parse(deployment.MasterChef)));
    const masterchefUSDTWallet = provider.open(
        await JettonWalletUSDT.fromInit(masterchef.address, Address.parse(deployment.USDT)),
    );

    await masterchef.send(
        provider.sender(),
        {
            value: toNano('0.5'),
        },
        {
            $$type: 'AddPool',
            lpTokenAddress: masterchefUSDTWallet.address,
            allocPoint: 5000n,
        },
    );
}
