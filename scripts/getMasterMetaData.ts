import { Address } from '@ton/core';

import { NetworkProvider } from '@ton/blueprint';
import { loadDeployment } from '../utils/helper';
import { JettonMasterChef } from '../wrappers/JettonMasterChef';

export async function run(provider: NetworkProvider) {
    const deployment = await loadDeployment();
    const masterchef = provider.open(
        JettonMasterChef.fromAddress(Address.parse('EQBN3O9ymb7FolXpoNVns_dIBOgx-0cTMuu3L97pKV8Tyrwn')),
    );
    const poolInfo = await masterchef.getGetPoolInfo(Address.parse('EQCOPIKlKspTjIKRYTrNz3w0x1yUMQzn76tV6H83E6yBf67q'));
    const metadata = await masterchef.getGetJettonMasterChefData();
    console.log('poolInfo', poolInfo);
    console.log('metadata', metadata);
}
