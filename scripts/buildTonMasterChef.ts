import { toNano, Address, beginCell } from '@ton/core';
import { Kitchen } from '../wrappers/Kitchen';
import { NetworkProvider } from '@ton/blueprint';
import { loadDeployment, updateDeployment } from '../utils/helper';

export async function run(provider: NetworkProvider) {
    const deployment = await loadDeployment();
    const kitchen = provider.open(Kitchen.fromAddress(Address.parse(deployment.Kitchen)));
    const seed = BigInt(`0x${beginCell().storeUint(Date.now(), 64).endCell().hash().toString('hex')}`);
    const masterchefAddress = await kitchen.getGetJettonMasterChefAddress(provider.sender().address!!, seed);
    const totalReward = toNano("0.1")
    let sentAmount = (totalReward * 1003n) / 1000n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 60);
    const startTime = BigInt(Math.floor(Date.now() / 1000)) + 10n;
    await kitchen.send(
        provider.sender(),
        {
            value: sentAmount + toNano('0.5'),
        },
        {
            $$type: 'BuildTonMasterChef',
            owner: provider.sender().address!!,
            seed: seed,
            metaData: beginCell().storeStringTail('httpppp').endCell(),
            deadline: deadline,
            startTime: startTime,
            totalReward: totalReward,
            queryId: 10n,
        },
    );
    await provider.waitForDeploy(masterchefAddress);
    if (!(await provider.isContractDeployed(masterchefAddress))) {
        return;
    }
    await updateDeployment('MasterChef', masterchefAddress.toString());
}
