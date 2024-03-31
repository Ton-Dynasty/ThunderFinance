import { toNano, Address, beginCell } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { JettonMasterUSDT } from '../wrappers/JettonMaster';
import { JettonWalletUSDT } from '../wrappers/JettonWallet';
import { loadDeployment, updateDeployment } from '../utils/helper';

export async function run(provider: NetworkProvider) {
    const deployment = await loadDeployment();
    const usdt = provider.open(JettonMasterUSDT.fromAddress(Address.parse(deployment.USDT)));
    await usdt.send(
        provider.sender(),
        {
            value: toNano('0.5'),
        },
        'Mint:1',
    );
}
