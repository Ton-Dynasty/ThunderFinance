import { toNano, Address, beginCell } from '@ton/core';
import { JettonMasterChef } from '../wrappers/JettonMasterChef';
import { JettonMinter } from '../wrappers/JettonMinter';
import { JettonWallet } from '../wrappers/RealJettonWallet';

import { NetworkProvider } from '@ton/blueprint';
import { loadDeployment } from '../utils/helper';

export async function run(provider: NetworkProvider) {
    const deployment = await loadDeployment();
    const masterchef = provider.open(JettonMasterChef.fromAddress(Address.parse(deployment.MasterChef)));
    console.log('masterchef', masterchef.address);

    const rewardTokenMasterAddress = Address.parse(deployment.RewardJettonMaster);
    const rewardTokenMaster = provider.open(JettonMinter.createFromAddress(rewardTokenMasterAddress));
    const senderUSDTWalletAddress = await rewardTokenMaster.getWalletAddress(provider.sender().address!!);
    const senderUSDTWallet = provider.open(JettonWallet.createFromAddress(senderUSDTWalletAddress));
    let depositAmount = 50n * 10n ** 9n;
    let forwardAmount = toNano('0.05');
    await senderUSDTWallet.sendTransfer(
        provider.sender(),
        toNano('0.1'),
        depositAmount,
        masterchef.address,
        provider.sender().address!!,
        null,
        forwardAmount,
        beginCell().endCell(),
    );
}
