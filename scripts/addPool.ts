import { toNano, Address, beginCell } from '@ton/core';
import { JettonMasterChef } from '../wrappers/JettonMasterChef';
import { NetworkProvider } from '@ton/blueprint';
import { loadDeployment } from '../utils/helper';
import { JettonMinter } from '../wrappers/JettonMinter';
import { JettonWallet } from '../wrappers/RealJettonWallet';

export async function run(provider: NetworkProvider) {
    const deployment = await loadDeployment();

    const masterchef = provider.open(JettonMasterChef.fromAddress(Address.parse(deployment.MasterChef)));
    const rewardTokenMasterAddress = Address.parse(deployment.RewardJettonMaster);
    const rewardTokenMaster = provider.open(JettonMinter.createFromAddress(rewardTokenMasterAddress));
    const masterchefUSDTWalletAddress = await rewardTokenMaster.getWalletAddress(masterchef.address);
    const masterchefUSDTWallet = provider.open(JettonWallet.createFromAddress(masterchefUSDTWalletAddress));

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
