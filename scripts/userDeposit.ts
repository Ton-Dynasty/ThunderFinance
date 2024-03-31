import { toNano, Address, beginCell } from '@ton/core';
import { MasterChef } from '../wrappers/MasterChef';
import { JettonWalletUSDT } from '../wrappers/JettonWallet';
import { JettonMasterUSDT } from '../wrappers/JettonMaster';

import { NetworkProvider } from '@ton/blueprint';
import { loadDeployment } from '../utils/helper';

export async function run(provider: NetworkProvider) {
    const deployment = await loadDeployment();
    const masterchef = provider.open(MasterChef.fromAddress(Address.parse(deployment.MasterChef)));
    console.log('masterchef', masterchef.address);

    const usdt = provider.open(JettonMasterUSDT.fromAddress(Address.parse(deployment.USDT)));
    const senderUSDTWalletAddress = await usdt.getGetWalletAddress(provider.sender().address!!);
    const senderUSDTWallet = provider.open(JettonWalletUSDT.fromAddress(senderUSDTWalletAddress));
    // EQBz38BhQJ-O-HFUwRJ35yXOtoBkY3WEXvTV9Q2mEzABYgFu
    let depositAmount = 50n * 10n ** 6n;
    await senderUSDTWallet.send(
        provider.sender(),
        { value: toNano('1.1') },
        {
            $$type: 'JettonTransfer',
            query_id: 0n,
            amount: depositAmount,
            destination: masterchef.address,
            response_destination: provider.sender().address!!,
            custom_payload: null,
            forward_ton_amount: toNano('1'),
            forward_payload: beginCell().endCell(),
        },
    );
}
