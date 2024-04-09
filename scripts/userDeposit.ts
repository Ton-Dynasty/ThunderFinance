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

    const rewardTokenMasterAddress = Address.parse('EQB3Xa6oQ4TVwXtDCYUq6DuDgWuZ6Lc-J2yaS5dirMMHyQpl');
    const rewardTokenMaster = provider.open(JettonMinter.createFromAddress(rewardTokenMasterAddress));
    const senderUSDTWalletAddress = await rewardTokenMaster.getWalletAddress(provider.sender().address!!);
    const senderUSDTWallet = provider.open(JettonWallet.createFromAddress(senderUSDTWalletAddress));
    // EQBz38BhQJ-O-HFUwRJ35yXOtoBkY3WEXvTV9Q2mEzABYgFu
    let depositAmount = 50n * 10n ** 6n;
    let forwardAmount = toNano('1');
    await senderUSDTWallet.sendTransfer(
        provider.sender(),
        toNano('2'),
        depositAmount,
        masterchef.address,
        provider.sender().address!!,
        null,
        forwardAmount,
        beginCell().endCell(),
    );
    // Before User Deposit: 50.95 TON
    // After User Deposit:  49.9 TON
    // 50.95 - 49.9 = 1.05 TON
}
