import { toNano, Address, beginCell } from '@ton/core';
import { Kitchen } from '../wrappers/MasterChef_Kitchen';
import { NetworkProvider } from '@ton/blueprint';
import { loadDeployment, updateDeployment } from '../utils/helper';
import { JettonMasterUSDT } from '../wrappers/JettonMaster';
import { JettonWalletUSDT } from '../wrappers/JettonWallet';

export async function run(provider: NetworkProvider) {
    const deployment = await loadDeployment();
    const kitchen = provider.open(Kitchen.fromAddress(Address.parse(deployment.Kitchen)));

    const usdt = provider.open(JettonMasterUSDT.fromAddress(Address.parse(deployment.USDT)));
    const senderUSDTWalletAddress = await usdt.getGetWalletAddress(provider.sender().address!!);
    const senderUSDTWallet = provider.open(JettonWalletUSDT.fromAddress(senderUSDTWalletAddress));
    console.log('senderUSDTWallet', (await senderUSDTWallet.getGetWalletData()).balance);
    const seed = BigInt(`0x${beginCell().storeUint(Date.now(), 64).endCell().hash().toString('hex')}`);
    const masterchefAddress = Address.parse(deployment.MasterChef);
    console.log('masterchefAddress', masterchefAddress.toString());

    const totalReward = 50n * 10n ** 6n;
    const deadline = Math.floor(Date.now() / 1000) + 60 * 60;
    console.log('Date.now()', Date.now());
    await senderUSDTWallet.send(
        provider.sender(),
        {
            value: toNano('1'),
        },
        {
            $$type: 'JettonTransfer',
            query_id: 0n,
            amount: (totalReward * 1003n) / 1000n,
            destination: masterchefAddress,
            response_destination: provider.sender().address!!,
            custom_payload: null,
            forward_ton_amount: toNano('0.1'),
            forward_payload: beginCell().storeCoins(totalReward).storeUint(deadline, 64).endCell(),
        },
    );
}
