import { toNano, Address, beginCell } from '@ton/core';
import { NetworkProvider, sleep } from '@ton/blueprint';
import { AirdropFactory } from '../wrappers/AirdropFactory';
import { IBalance, MerkleTree, hashLeafNodes, packBalance, packProof } from '../utils/MerkleTree';
import { MerkleDistributor } from '../wrappers/MerkleDistributor';
import { JettonMasterUSDT } from '../wrappers/JettonMaster';
import { JettonWalletUSDT } from '../wrappers/JettonWallet';
import { loadDeployment, updateDeployment } from '../utils/helper';

export async function run(provider: NetworkProvider) {
    const deployInfo = await loadDeployment();
    const usdt = provider.open(JettonMasterUSDT.fromAddress(Address.parse(deployInfo.USDT)));
    const hashLeafNodes: Buffer[] = deployInfo.MerkleDistributor.merkleNodes.map((item: string) => {
        return Buffer.from(item, 'hex');
    });
    console.log('Leaf nodes', hashLeafNodes);
    const airdropList: IBalance[] = deployInfo.MerkleDistributor.airdropList.map((item: any): IBalance => {
        return {
            account: Address.parse(item.account),
            amount: BigInt(item.amount),
        };
    })!;

    // mint usdt (uncomment if needed)
    await usdt.send(
        provider.sender(),
        {
            value: toNano('1'),
        },
        'Mint:1',
    );

    // transfer usdt to distributor
    const jw = await usdt.getGetWalletAddress(provider.sender().address!!);
    const myJettonWallet = provider.open(JettonWalletUSDT.fromAddress(jw));
    await myJettonWallet.send(
        provider.sender(),
        { value: toNano('1') },
        {
            $$type: 'JettonTransfer',
            query_id: BigInt(1),
            amount: airdropList.reduce((acc, item) => acc + item.amount, 0n),
            destination: Address.parse(deployInfo.MerkleDistributor.address),
            custom_payload: null,
            response_destination: provider.sender().address!!,
            forward_ton_amount: 0n,
            forward_payload: beginCell().endCell(),
        },
    );
}
