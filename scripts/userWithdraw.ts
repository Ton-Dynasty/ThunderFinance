import { Withdraw, JettonMasterChef } from '../wrappers/JettonMasterChef';
import { toNano, Address, beginCell } from '@ton/core';
import { JettonMinter } from '../wrappers/JettonMinter';
import { JettonWallet } from '../wrappers/RealJettonWallet';

import { NetworkProvider } from '@ton/blueprint';
import { loadDeployment } from '../utils/helper';

export async function run(provider: NetworkProvider) {
    const deployment = await loadDeployment();
    const masterchef = provider.open(JettonMasterChef.fromAddress(Address.parse(deployment.MasterChef)));

    const rewardTokenMasterAddress = Address.parse(deployment.RewardJettonMaster);
    const rewardTokenMaster = provider.open(JettonMinter.createFromAddress(rewardTokenMasterAddress));

    const masterchefUSDTWalletAddress = await rewardTokenMaster.getWalletAddress(masterchef.address);
    const masterchefUSDTWallet = provider.open(JettonWallet.createFromAddress(masterchefUSDTWalletAddress));
    const withdrawAmount = 25n * 10n ** 9n;
    await masterchef.send(
        provider.sender(),
        { value: toNano('1') },
        {
            $$type: 'Withdraw',
            queryId: 0n,
            lpTokenAddress: masterchefUSDTWallet.address,
            amount: withdrawAmount,
            beneficiary: provider.sender().address!!,
        },
    );
}
