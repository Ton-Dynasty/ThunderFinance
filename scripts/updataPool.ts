import { Withdraw } from './../build/MasterChef/tact_MasterChef';
import { toNano, Address, beginCell } from '@ton/core';
import { MasterChef } from '../wrappers/MasterChef';
import { JettonWalletUSDT } from '../wrappers/JettonWallet';
import { JettonMasterUSDT } from '../wrappers/JettonMaster';

import { NetworkProvider } from '@ton/blueprint';
import { loadDeployment } from '../utils/helper';

export async function run(provider: NetworkProvider) {
    const deployment = await loadDeployment();
    const masterchef = provider.open(MasterChef.fromAddress(Address.parse(deployment.MasterChef)));

    const usdt = provider.open(JettonMasterUSDT.fromAddress(Address.parse(deployment.USDT)));

    const masterchefUSDTWalletAddress = await usdt.getGetWalletAddress(masterchef.address);
    await masterchef.send(
        provider.sender(),
        { value: toNano('0.05') },
        {
            $$type: 'UpdatePool',
            lpTokenAddress: masterchefUSDTWalletAddress,
        },
    );
}
