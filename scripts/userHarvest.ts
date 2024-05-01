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
    await await masterchef.send(
        provider.sender(),
        { value: toNano('1') },
        {
            $$type: 'Harvest',
            queryId: 0n,
            lpTokenAddress: masterchefUSDTWalletAddress,
            beneficiary: provider.sender().address!!,
        },
    );
}
