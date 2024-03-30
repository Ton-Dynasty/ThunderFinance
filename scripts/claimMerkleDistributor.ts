import { toNano, Address, beginCell } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { AirdropFactory } from '../wrappers/AirdropFactory';
import { IBalance, MerkleTree, hashLeafNodes, packBalance, packProof } from '../utils/MerkleTree';
import { MerkleDistributor } from '../wrappers/MerkleDistributor';
import { loadDeployment, updateDeployment } from '../utils/helper';

export async function run(provider: NetworkProvider) {
    const deployInfo = await loadDeployment();
    const hashLeafNodes: Buffer[] = deployInfo.MerkleDistributor.merkleNodes.map((item: string) => {
        return Buffer.from(item, 'hex');
    });
    const airDropList: IBalance[] = deployInfo.MerkleDistributor.airdropList.map((item: any): IBalance => {
        return {
            account: Address.parse(item.account),
            amount: BigInt(item.amount),
        };
    })!;

    // // open factory contract
    const merkleTree = MerkleTree.fromLeafs(hashLeafNodes);

    // get proof for this sender
    const myAirdrop = airDropList.find((item) => item.account.toString() === provider.sender().address!!.toString())!;
    console.log('Find my airdrop', myAirdrop);
    const balance = packBalance(myAirdrop);
    const hexProof = merkleTree.getHexProof(balance);
    const merkleProof = packProof(hexProof);

    // get airdrop
    const distributor = provider.open(MerkleDistributor.fromAddress(Address.parse(deployInfo.MerkleDistributor.address)));
    await distributor.send(
        provider.sender(),
        {
            value: toNano('1'),
        },
        {
            $$type: 'Claim',
            merkleProof: merkleProof,
            merkleProofSize: BigInt(hexProof.length),
            amount: BigInt(myAirdrop.amount),
        },
    );
}
