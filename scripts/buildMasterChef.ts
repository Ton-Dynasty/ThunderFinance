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
    const senderUSDTWallet = provider.open(await JettonWalletUSDT.fromInit(provider.sender().address!!, usdt.address));
    console.log('senderUSDTWallet', (await senderUSDTWallet.getGetWalletData()).balance);
    const seed = BigInt(`0x${beginCell().storeUint(Date.now(), 64).endCell().hash().toString('hex')}`);
    const masterchefAddress = await kitchen.getGetMasterChefAddress(provider.sender().address!!, seed);
    const masterchefUSDTWallet = provider.open(await JettonWalletUSDT.fromInit(masterchefAddress, usdt.address));

    await kitchen.send(
        provider.sender(),
        {
            value: toNano('0.5'),
        },
        {
            $$type: 'BuildMasterChef',
            owner: provider.sender().address!!,
            seed: seed,
            thunderMintWallet: provider.sender().address!!,
            thunderMintJettonWallet: senderUSDTWallet.address, // owner jettonWallet
            mcRewardJettonWallet: masterchefUSDTWallet.address,
            metaData: beginCell().storeStringTail('httpppp').endCell(),
        },
    );
    await provider.waitForDeploy(masterchefAddress);
    if (!(await provider.isContractDeployed(masterchefAddress))) {
        return;
    }
    await updateDeployment('MasterChef', masterchefAddress.toString());
    const totalReward = 50n * 10n ** 9n;
    const deadline = Date.now() + 60 * 60;
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
