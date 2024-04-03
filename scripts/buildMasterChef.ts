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
    const masterchefAddress = await kitchen.getGetMasterChefAddress(provider.sender().address!!, seed);
    const mcUSDTWalletAddress = await usdt.getGetWalletAddress(masterchefAddress);
    const masterchefUSDTWallet = provider.open(await JettonWalletUSDT.fromAddress(mcUSDTWalletAddress));
    const totalReward = 50n * 10n ** 6n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 60);

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
            deadline: deadline,
            totalReward: totalReward,
        },
    );
    await provider.waitForDeploy(masterchefAddress);
    if (!(await provider.isContractDeployed(masterchefAddress))) {
        return;
    }
    await updateDeployment('MasterChef', masterchefAddress.toString());
}
