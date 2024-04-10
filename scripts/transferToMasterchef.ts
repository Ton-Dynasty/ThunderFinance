import { toNano, Address, beginCell } from '@ton/core';
import { Kitchen } from '../wrappers/Kitchen';
import { NetworkProvider } from '@ton/blueprint';
import { loadDeployment, updateDeployment } from '../utils/helper';
import { JettonMinter } from '../wrappers/JettonMinter';
import { JettonWallet } from '../wrappers/RealJettonWallet';

export async function run(provider: NetworkProvider) {
    const deployment = await loadDeployment();
    const kitchen = provider.open(Kitchen.fromAddress(Address.parse(deployment.Kitchen)));

    const rewardTokenMasterAddress = Address.parse("EQB3Xa6oQ4TVwXtDCYUq6DuDgWuZ6Lc-J2yaS5dirMMHyQpl")
    const rewardTokenMaster = provider.open(JettonMinter.createFromAddress(rewardTokenMasterAddress));
    const senderUSDTWalletAddress = await rewardTokenMaster.getWalletAddress(provider.sender().address!!);
    const senderUSDTWallet = provider.open(JettonWallet.createFromAddress(senderUSDTWalletAddress));
    console.log('senderUSDTWallet', (await senderUSDTWallet.getJettonBalance()).toString());
    const seed = BigInt(`0x${beginCell().storeUint(Date.now(), 64).endCell().hash().toString('hex')}`);
    const masterchefAddress = Address.parse(deployment.MasterChef);
    console.log('masterchefAddress', masterchefAddress.toString());

    const totalReward = 50n * 10n ** 6n;
    console.log('Date.now()', Date.now());

    let sentAmount = (totalReward * 1003n) / 1000n;
    let forwardAmount = toNano('0.1');
    await senderUSDTWallet.sendTransfer(provider.sender(), toNano('1'), sentAmount, masterchefAddress, provider.sender().address!!, null, forwardAmount, null);

}
