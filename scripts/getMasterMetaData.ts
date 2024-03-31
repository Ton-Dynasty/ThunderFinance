import { Address } from '@ton/core';
import { MasterChef } from '../wrappers/MasterChef';

import { NetworkProvider } from '@ton/blueprint';
import { loadDeployment } from '../utils/helper';

export async function run(provider: NetworkProvider) {
    const deployment = await loadDeployment();
    const masterchef = provider.open(MasterChef.fromAddress(Address.parse(deployment.MasterChef)));
    const reward = await masterchef.getGetMasterChefData();
    console.log('getGetMasterChefData', reward);
    const pool = reward.pools;
    console.log('pool', pool);
}
