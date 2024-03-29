import { toNano, Address, beginCell } from '@ton/core';
import { Kitchen } from '../wrappers/MasterChef_Kitchen';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const kitchen = provider.open(await Kitchen.fromInit(provider.sender().address!!));

    await kitchen.send(
        provider.sender(),
        {
            value: toNano('0.5'),
        },
        {
            $$type: 'BuildMasterChef',
            owner: provider.sender().address!!,
            thunderMintWallet: provider.sender().address!!,
            thunderMintJettonWallet: Address.parse('kQDKblohTL9rB7SKscW9EsXeH_3xnxLdPcQkGUEz8s5VJhRE'),
            rewardWallet: Address.parse('kQBTNMx-4M1DFTmkEiBazXTz--Gs_i5Yv9GYctwN9h-Ctv-f'),
            metaData: beginCell().storeStringTail('httpppp').endCell(),
        },
    );
}
